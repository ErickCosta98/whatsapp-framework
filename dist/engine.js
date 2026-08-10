import { EventEmitter } from "events";
import pino from "pino";
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, } from "@whiskeysockets/baileys";
import * as fs from "node:fs";
import * as path from "node:path";
import { SessionManager } from "./session.js";
import { calculateBackoffDelay, isTerminalError } from "./reconnect/backoff.js";
import { simulateTyping } from "./anti-ban/typing.js";
import { resolveDeliverableJid } from "./lid/resolver.js";
import { normalizeIncomingMessage, normalizeSentResult, DEFAULT_MEDIA_CAP_BYTES } from "./normalizer.js";
import { createMessageStore } from "./retry/store.js";
/**
 * Core WhatsApp engine managing multiple named sessions, connection lifecycle,
 * reconnection backoff, and message normalization.
 *
 * Emits typed events via Node.js EventEmitter:
 *   - `connection` — session status changes (QR, pairing, connected, etc.)
 *   - `message` — inbound normalized messages
 *   - `message:create` — outgoing messages created by this account
 *   - `message:ack` — delivery status updates
 *   - `message:revoked` — remotely deleted messages
 *   - `message:reaction` — reactions
 *   - `error` — session errors
 *
 * @example
 * ```ts
 * const engine = new WhatsAppEngine({ authDir: "./auth" });
 * engine.on("connection", (ev) => console.log(ev.status));
 * await engine.connect("bot-1");
 * ```
 */
export class WhatsAppEngine extends EventEmitter {
    config;
    logger;
    sessions;
    adapter = null;
    /** In-memory LID → phone lookup table shared across sessions. */
    lidMap = new Map();
    /** Per-session in-memory message stores for Baileys retry protocol. */
    messageStores = new Map();
    constructor(config) {
        super();
        this.config = this.resolveConfig(config);
        this.logger = pino({ level: this.config.logLevel });
        this.sessions = new SessionManager();
    }
    /* ─── Configuration ─── */
    resolveConfig(config) {
        return {
            authDir: config.authDir,
            browser: config.browser ?? ["WhatsApp Framework", "Chrome", "120.0.0"],
            markOnlineOnConnect: config.markOnlineOnConnect ?? false,
            simulateTyping: config.simulateTyping ?? true,
            simulateTypingMaxMs: config.simulateTypingMaxMs ?? 5_000,
            delayBetweenMessages: config.delayBetweenMessages ?? 3_000,
            randomizeDelay: config.randomizeDelay ?? true,
            messageStoreCap: config.messageStoreCap ?? 5_000,
            logLevel: config.logLevel ?? "warn",
            mediaMaxSize: config.mediaMaxSize ?? DEFAULT_MEDIA_CAP_BYTES,
            syncFullHistory: config.syncFullHistory ?? false,
        };
    }
    /* ─── Public API ─── */
    /**
     * Register a database adapter for session persistence, message storage,
     * and LID mapping. Must be called before `connect()`.
     */
    registerAdapter(adapter) {
        this.adapter = adapter;
    }
    /**
     * Check whether a database adapter has been registered.
     */
    hasAdapter() {
        return this.adapter !== null;
    }
    /**
     * Start a named session: load or create auth state, open a Baileys socket,
     * and begin listening for QR / connection events.
     *
     * @throws if no adapter is registered
     */
    async connect(name) {
        if (!this.adapter) {
            throw new Error("Database adapter not registered");
        }
        const session = this.sessions.create(name);
        if (session.connecting) {
            this.logger.warn({ session: name }, "connect() already in progress");
            return;
        }
        this.sessions.setConnecting(name, true);
        try {
            await this.connectInner(name);
        }
        finally {
            this.sessions.setConnecting(name, false);
        }
    }
    async connectInner(name) {
        // Clear any stale reconnect timer before starting fresh.
        this.sessions.clearReconnectTimer(name);
        const authDir = path.join(this.config.authDir, name);
        await fs.promises.mkdir(authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        state.keys = makeCacheableSignalKeyStore(state.keys, this.logger);
        const { version } = await fetchLatestBaileysVersion();
        // Resurrect-after-stop guard: if disconnect ran during the awaits above,
        // bail out so we don't create a live socket for an intentionally-stopped session.
        if (this.sessions.get(name)?.intentionalClose) {
            return;
        }
        // Tear down any previous socket for this session before creating the new one.
        const previous = this.sessions.get(name)?.socket;
        if (previous) {
            try {
                previous.ev.removeAllListeners("connection.update");
                previous.ev.removeAllListeners("creds.update");
                previous.ev.removeAllListeners("messages.upsert");
                previous.ev.removeAllListeners("contacts.upsert");
                previous.ev.removeAllListeners("chats.upsert");
                previous.ev.removeAllListeners("messaging-history.set");
                previous.ev.removeAllListeners("lid-mapping.update");
                previous.end(undefined);
            }
            catch {
                // end() may already have run from Baileys' own close handler.
            }
            this.sessions.setSocket(name, null);
        }
        // Create a per-session message store for the retry protocol.
        const messageStore = createMessageStore(this.config.messageStoreCap);
        this.messageStores.set(name, messageStore);
        const sock = makeWASocket({
            auth: state,
            version,
            browser: this.config.browser,
            logger: this.logger,
            printQRInTerminal: false,
            markOnlineOnConnect: this.config.markOnlineOnConnect,
            shouldSyncHistoryMessage: () => true,
            syncFullHistory: this.config.syncFullHistory,
            getMessage: async (key) => {
                if (!key?.id)
                    return undefined;
                // Prefer adapter-backed store when available.
                if (this.adapter) {
                    const stored = await this.adapter.getMessage(name, key.id);
                    if (stored)
                        return stored.message;
                }
                const stored = messageStore.get(key.id);
                return stored ?? undefined;
            },
        });
        this.sessions.setSocket(name, sock);
        this.sessions.setStatus(name, "initializing");
        // ── Event wiring ──
        sock.ev.on("connection.update", (update) => {
            this.handleConnectionUpdate(name, update);
        });
        sock.ev.on("creds.update", () => {
            void saveCreds();
            if (this.adapter) {
                const session = this.sessions.get(name);
                if (session) {
                    void this.adapter.upsertSession({
                        name,
                        status: session.status,
                        phone: session.phone,
                        pushName: session.pushName,
                        updatedAt: Date.now(),
                    });
                }
            }
        });
        sock.ev.on("messages.upsert", (event) => {
            this.handleMessagesUpsert(name, event);
        });
        sock.ev.on("contacts.upsert", (contacts) => {
            if (!this.adapter)
                return;
            for (const contact of contacts) {
                void this.adapter.upsertContact({
                    id: contact.id,
                    name: contact.name ?? null,
                    pushName: contact.notify ?? null,
                    number: contact.phoneNumber ?? contact.id?.split("@")[0] ?? null,
                    isMyContact: contact.isMyContact ?? false,
                    isBlocked: false,
                });
            }
        });
        sock.ev.on("chats.upsert", (chats) => {
            if (!this.adapter)
                return;
            for (const chat of chats) {
                void this.adapter.upsertChat({
                    id: chat.id,
                    name: chat.name ?? null,
                    phoneJid: null,
                    unreadCount: chat.unreadCount ?? 0,
                    lastMessageTimestamp: chat.lastMessageTimestamp
                        ? Number(chat.lastMessageTimestamp)
                        : undefined,
                });
            }
        });
        sock.ev.on("messaging-history.set", (history) => {
            const mappings = history.lidPnMappings ?? [];
            for (const mapping of mappings) {
                if (mapping.lid && mapping.pn) {
                    this.lidMap.set(mapping.lid, mapping.pn);
                    if (this.adapter) {
                        void this.adapter.upsertLidMapping(mapping.lid, mapping.pn);
                    }
                }
            }
        });
        sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
            if (lid && pn) {
                this.lidMap.set(lid, pn);
                if (this.adapter) {
                    void this.adapter.upsertLidMapping(lid, pn);
                }
            }
        });
    }
    /**
     * Gracefully stop a session: clear timers, end the socket, and update status.
     */
    async disconnect(name) {
        const session = this.sessions.get(name);
        if (!session) {
            this.logger.warn({ session: name }, "disconnect called for unknown session");
            return;
        }
        this.sessions.markIntentionalClose(name);
        this.sessions.clearReconnectTimer(name);
        if (session.socket) {
            try {
                session.socket.ev.removeAllListeners("connection.update");
                session.socket.ev.removeAllListeners("creds.update");
                session.socket.ev.removeAllListeners("messages.upsert");
                session.socket.ev.removeAllListeners("contacts.upsert");
                session.socket.ev.removeAllListeners("chats.upsert");
                session.socket.ev.removeAllListeners("messaging-history.set");
                session.socket.ev.removeAllListeners("lid-mapping.update");
                session.socket.end(undefined);
            }
            catch {
                // ignore
            }
            this.sessions.setSocket(name, null);
        }
        this.messageStores.delete(name);
        this.sessions.setStatus(name, "disconnected");
        this.emit("connection", {
            sessionName: name,
            status: "disconnected",
        });
    }
    /**
     * Stop all sessions and clean up resources.
     */
    async stop() {
        const names = this.sessions.list();
        for (const name of names) {
            await this.disconnect(name);
        }
        this.removeAllListeners();
    }
    /**
     * Request a pairing code as an alternative to QR scanning.
     *
     * @throws if the session socket is not initialized
     * @throws if the session is already authenticated
     */
    async requestPairingCode(name, phoneNumber) {
        const session = this.sessions.get(name);
        if (!session || !session.socket) {
            throw new Error("Session not initialized");
        }
        if (session.status === "connected") {
            throw new Error("Already authenticated");
        }
        // Basic phone validation: must start with + and contain only digits/plus.
        const phoneRegex = /^\+[1-9]\d{7,14}$/;
        if (!phoneRegex.test(phoneNumber)) {
            throw new Error("Invalid phone number format");
        }
        const code = await session.socket.requestPairingCode(phoneNumber);
        this.sessions.setPairingCode(name, code);
        this.emit("connection", { sessionName: name, status: "pairing_code", pairingCode: code });
        return code;
    }
    /**
     * Send a text message through a connected session.
     *
     * @throws if the session is not connected
     */
    async sendText(name, chatId, text) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.socket) {
            throw new Error("Session not connected");
        }
        const jid = resolveDeliverableJid(chatId, this.lidMap);
        if (this.config.simulateTyping) {
            await simulateTyping(text.length, this.config.simulateTypingMaxMs);
        }
        const sent = await session.socket.sendMessage(jid, { text });
        // Store for retry protocol
        if (sent?.key?.id) {
            const store = this.messageStores.get(name);
            if (store) {
                store.set(sent.key.id, sent);
            }
            if (this.adapter) {
                void this.adapter.putMessage(name, {
                    keyId: sent.key.id,
                    message: sent,
                    timestamp: Date.now(),
                });
            }
        }
        return normalizeSentResult(sent, jid);
    }
    /**
     * Send media through a connected session.
     *
     * @throws if the session is not connected
     * @throws if media exceeds the configured size cap
     */
    async sendMedia(name, chatId, media) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.socket) {
            throw new Error("Session not connected");
        }
        // Validate size
        const data = Buffer.isBuffer(media.data)
            ? media.data
            : Buffer.from(media.data, "base64");
        if (data.length > this.config.mediaMaxSize) {
            throw new Error("Media exceeds size cap");
        }
        const jid = resolveDeliverableJid(chatId, this.lidMap);
        let content;
        if (media.mimetype.startsWith("image/")) {
            content = { image: data, mimetype: media.mimetype, caption: media.caption };
        }
        else if (media.mimetype.startsWith("video/")) {
            content = { video: data, mimetype: media.mimetype, caption: media.caption };
        }
        else if (media.mimetype.startsWith("audio/")) {
            content = { audio: data, mimetype: media.mimetype, ptt: media.ptt ?? false };
        }
        else {
            content = {
                document: data,
                mimetype: media.mimetype,
                fileName: media.filename ?? "file",
                caption: media.caption,
            };
        }
        if (media.mentions?.length) {
            content.mentions = media.mentions;
        }
        const sent = await session.socket.sendMessage(jid, content);
        if (sent?.key?.id) {
            const store = this.messageStores.get(name);
            if (store) {
                store.set(sent.key.id, sent);
            }
            if (this.adapter) {
                void this.adapter.putMessage(name, {
                    keyId: sent.key.id,
                    message: sent,
                    timestamp: Date.now(),
                });
            }
        }
        return normalizeSentResult(sent, jid);
    }
    /**
     * Send a chat state indicator (typing / recording / paused) to a chat.
     *
     * @throws if the session is not connected
     */
    async sendChatState(name, chatId, state) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.socket) {
            throw new Error("Session not connected");
        }
        const jid = resolveDeliverableJid(chatId, this.lidMap);
        const presence = state === "typing" ? "composing" : state === "recording" ? "recording" : "paused";
        await session.socket.sendPresenceUpdate(presence, jid);
    }
    /**
     * Get the current connection status of a session.
     */
    getStatus(name) {
        return this.sessions.status(name);
    }
    /**
     * Get the QR code for a session (if available).
     */
    getQR(name) {
        return this.sessions.get(name)?.qr ?? null;
    }
    /**
     * Get the pairing code for a session (if available).
     */
    getPairingCode(name) {
        return this.sessions.get(name)?.pairingCode ?? null;
    }
    /**
     * Return all managed session names.
     */
    listSessions() {
        return this.sessions.list();
    }
    /* ─── EventEmitter typing ─── */
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    /* ─── Private ─── */
    handleConnectionUpdate(name, update) {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            this.sessions.setQR(name, qr);
            this.emit("connection", { sessionName: name, status: "qr", qr });
        }
        if (connection === "connecting") {
            this.sessions.setStatus(name, "connecting");
            this.emit("connection", { sessionName: name, status: "connecting" });
        }
        if (connection === "open") {
            const session = this.sessions.get(name);
            const sock = session?.socket;
            const phone = sock?.user?.id?.split(":")[0] ?? null;
            const pushName = sock?.user?.name ?? null;
            this.sessions.setQR(name, null);
            this.sessions.resetReconnectAttempts(name);
            this.sessions.setStatus(name, "connected");
            this.sessions.setAccountInfo(name, phone, pushName);
            this.emit("connection", {
                sessionName: name,
                status: "connected",
                phone,
                pushName,
            });
        }
        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const terminal = isTerminalError(statusCode);
            if (this.sessions.get(name)?.intentionalClose) {
                this.sessions.clearIntentionalClose(name);
                this.sessions.setSocket(name, null);
                this.sessions.setStatus(name, "disconnected");
                this.emit("connection", { sessionName: name, status: "disconnected" });
                return;
            }
            if (terminal) {
                this.sessions.setSocket(name, null);
                this.sessions.setStatus(name, "logged_out");
                this.emit("connection", { sessionName: name, status: "logged_out" });
                if (statusCode === 401) {
                    const authDir = path.join(this.config.authDir, name);
                    try {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    }
                    catch {
                        // ignore
                    }
                }
                this.sessions.resetReconnectAttempts(name);
                return;
            }
            // Transient disconnect — schedule reconnect with capped exponential backoff.
            this.sessions.setStatus(name, "disconnected");
            this.emit("connection", { sessionName: name, status: "disconnected" });
            const attempts = this.sessions.incrementReconnectAttempts(name);
            const delay = calculateBackoffDelay(attempts);
            this.logger.warn({ session: name, attempts, delayMs: delay, statusCode }, "transient disconnect; scheduling reconnect");
            const timer = setTimeout(() => {
                this.sessions.clearReconnectTimer(name);
                this.connect(name).catch((err) => {
                    this.logger.warn({ session: name, err }, "reconnect attempt failed");
                });
            }, delay);
            this.sessions.setReconnectTimer(name, timer);
        }
    }
    handleMessagesUpsert(name, event) {
        for (const msg of event.messages) {
            if (!msg.key?.remoteJid || !msg.key.id)
                continue;
            // Capture remoteJidAlt LID→phone mapping when available.
            const remoteJidAlt = msg.key.remoteJidAlt;
            if (msg.key.remoteJid.endsWith("@lid") && remoteJidAlt) {
                this.lidMap.set(msg.key.remoteJid, remoteJidAlt);
                if (this.adapter) {
                    void this.adapter.upsertLidMapping(msg.key.remoteJid, remoteJidAlt);
                }
            }
            const normalized = normalizeIncomingMessage(msg, this.lidMap);
            this.emit("message", { sessionName: name, message: normalized });
            if (this.adapter) {
                void this.adapter.putMessage(name, {
                    keyId: msg.key.id,
                    message: msg,
                    timestamp: normalized.timestamp,
                });
            }
        }
    }
}
//# sourceMappingURL=engine.js.map