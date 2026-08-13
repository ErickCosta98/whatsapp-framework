import { EventEmitter } from "events";
import pino from "pino";
import { loadMessengerClient } from "./client-loader.js";
import { bufferToReadStream } from "./media-converter.js";
import { normalizeMessengerMessage } from "./normalizer.js";
import { DEFAULT_MEDIA_CAP_BYTES } from "../normalizer.js";
function resolveConfig(config) {
    return {
        appState: config.appState ?? "",
        email: config.email ?? "",
        password: config.password ?? "",
        logLevel: config.logLevel ?? "warn",
        mediaMaxSize: config.mediaMaxSize ?? DEFAULT_MEDIA_CAP_BYTES,
        encryptAppState: config.encryptAppState ?? ((plain) => plain),
        decryptAppState: config.decryptAppState ?? ((cipher) => cipher),
    };
}
/**
 * Core Facebook Messenger engine managing multiple named sessions,
 * connection lifecycle, and message sending.
 *
 * Mirrors the public API of WhatsAppEngine while using the nkxfca
 * library (loaded lazily via createRequire) for Messenger platform support.
 *
 * Emits typed events via Node.js EventEmitter:
 *   - `connection` — session status changes
 *   - `message` — inbound normalized messages (wired in T8)
 *   - `message:create` — outgoing messages created by this account
 *   - `message:ack` — synthetic delivery status after send
 *   - `message:revoked` — remotely deleted messages (wired in T8)
 *   - `error` — session errors
 */
export class MessengerEngine extends EventEmitter {
    config;
    logger;
    sessions = new Map();
    adapter = null;
    constructor(config) {
        super();
        this.config = resolveConfig(config);
        this.logger = pino({ level: this.config.logLevel });
    }
    /**
     * Register a database adapter for session persistence.
     * Must be called before `connect()`.
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
     * Start a named session: load or restore appState, call nkxfca login,
     * store the API, and emit connection events.
     *
     * If no explicit `appState` is provided and `config.appState` is empty,
     * attempts to restore encrypted appState from the adapter and decrypt
     * it via `config.decryptAppState`.
     *
     * @throws if no adapter is registered
     */
    async connect(name, appState) {
        if (!this.adapter) {
            throw new Error("Database adapter not registered");
        }
        const existing = this.sessions.get(name);
        if (existing?.connecting) {
            this.logger.warn({ session: name }, "connect() already in progress");
            return;
        }
        if (!existing) {
            this.sessions.set(name, {
                name,
                api: null,
                status: "initializing",
                currentUserID: null,
                connecting: false,
                listening: false,
            });
        }
        this.setConnecting(name, true);
        try {
            await this.connectInner(name, appState);
        }
        finally {
            this.setConnecting(name, false);
        }
    }
    async connectInner(name, explicitAppState) {
        this.emit("connection", { sessionName: name, status: "initializing" });
        let appState = explicitAppState ?? this.config.appState;
        if (!appState && this.adapter) {
            const record = await this.adapter.getSession(name);
            if (record?.appState) {
                appState = this.config.decryptAppState(record.appState);
            }
        }
        const client = await loadMessengerClient();
        const credentials = {};
        if (appState) {
            try {
                credentials.appState = JSON.parse(appState);
            }
            catch {
                credentials.appState = appState;
            }
        }
        else if (this.config.email && this.config.password) {
            credentials.email = this.config.email;
            credentials.password = this.config.password;
        }
        this.setStatus(name, "connecting");
        this.emit("connection", { sessionName: name, status: "connecting" });
        try {
            const api = (await client.login(credentials));
            if (!api) {
                throw new Error("Messenger login did not return an API instance");
            }
            const session = this.sessions.get(name);
            session.api = api;
            session.currentUserID = api.getCurrentUserID();
            this.setStatus(name, "connected");
            this.startListening(name, api);
            if (this.adapter) {
                const plainAppState = appState || "";
                const encrypted = this.config.encryptAppState(plainAppState);
                await this.adapter.upsertSession({
                    name,
                    status: "connected",
                    platform: "messenger",
                    appState: encrypted || null,
                    updatedAt: Date.now(),
                });
            }
            this.emit("connection", {
                sessionName: name,
                status: "connected",
            });
        }
        catch (err) {
            this.setStatus(name, "failed");
            this.emit("connection", {
                sessionName: name,
                status: "failed",
                reason: err?.message,
            });
            this.emit("error", {
                sessionName: name,
                error: err instanceof Error ? err : new Error(String(err)),
            });
            throw err;
        }
    }
    /**
     * Start listening for inbound events on a connected session.
     * Guards against double-listen.
     */
    startListening(name, api) {
        const session = this.sessions.get(name);
        if (!session || session.listening)
            return;
        session.listening = true;
        api.listenMqtt((err, event) => {
            if (!session.listening)
                return;
            if (err) {
                this.logger.warn({ session: name, error: err }, "listenMqtt callback error");
                return;
            }
            try {
                this.handleListenEvent(name, event);
            }
            catch (handlerErr) {
                this.logger.warn({ session: name, error: handlerErr?.message ?? handlerErr }, "listenMqtt event handler error");
            }
        });
    }
    /**
     * Dispatch a single inbound nkxfca event to the appropriate engine emission.
     */
    handleListenEvent(name, event) {
        if (!event || typeof event !== "object")
            return;
        const session = this.sessions.get(name);
        if (!session)
            return;
        switch (event.type) {
            case "message":
            case "message_reply": {
                const normalized = normalizeMessengerMessage(event, session.currentUserID ?? "");
                this.emit("message", { sessionName: name, message: normalized });
                break;
            }
            case "unsend":
            case "message_unsend": {
                const timestamp = Number(event.deletionTimestamp ?? event.timestamp ?? Date.now());
                this.emit("message:revoked", {
                    id: String(event.messageID ?? ""),
                    chatId: String(event.threadID ?? ""),
                    from: String(event.senderID ?? ""),
                    to: String(event.threadID ?? ""),
                    timestamp,
                });
                break;
            }
            // log:* and other event types are intentionally ignored per spec R5.5
        }
    }
    /**
     * Gracefully stop a session: clear API reference and update status.
     */
    async disconnect(name) {
        const session = this.sessions.get(name);
        if (!session) {
            this.logger.warn({ session: name }, "disconnect called for unknown session");
            return;
        }
        session.listening = false;
        if (session.api?.stopListening) {
            try {
                session.api.stopListening();
            }
            catch {
                // ignore
            }
        }
        session.api = null;
        this.setStatus(name, "disconnected");
        this.emit("connection", { sessionName: name, status: "disconnected" });
    }
    /**
     * Stop all sessions and clean up resources.
     */
    async stop() {
        const names = Array.from(this.sessions.keys());
        for (const name of names) {
            await this.disconnect(name);
        }
        this.sessions.clear();
        this.removeAllListeners();
    }
    /**
     * Get the current connection status of a session.
     */
    getStatus(name) {
        return this.sessions.get(name)?.status;
    }
    /**
     * Get the QR code for a session. Not supported for Messenger.
     * Always returns `null`.
     */
    getQR(_name) {
        return null;
    }
    /**
     * Get the pairing code for a session. Not supported for Messenger.
     * Always returns `null`.
     */
    getPairingCode(_name) {
        return null;
    }
    /**
     * Request a pairing code. Not supported for Messenger.
     * Always rejects.
     */
    requestPairingCode(_name, _phoneNumber) {
        return Promise.reject(new Error("Not supported for Messenger platform"));
    }
    /**
     * Return all managed session names.
     */
    listSessions() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Send a text message through a connected session.
     *
     * @throws if the session is not connected
     */
    async sendText(name, chatId, text) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.api) {
            throw new Error("Session not connected");
        }
        const result = await session.api.sendMessage(text, chatId);
        const sendResult = this.normalizeSendResult(result);
        this.emit("message:create", {
            sessionName: name,
            message: this.buildSyntheticMessage(sendResult, session.currentUserID ?? "", chatId, text, "text"),
        });
        this.emit("message:ack", sendResult.id, "delivered");
        return sendResult;
    }
    /**
     * Send media through a connected session.
     *
     * @throws if the session is not connected
     * @throws if media exceeds the configured size cap
     */
    async sendMedia(name, chatId, media) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.api) {
            throw new Error("Session not connected");
        }
        const data = Buffer.isBuffer(media.data)
            ? media.data
            : Buffer.from(media.data, "base64");
        if (data.length > this.config.mediaMaxSize) {
            throw new Error("Media exceeds size cap");
        }
        const { stream } = bufferToReadStream(data, media.mimetype);
        const messageObject = {
            attachment: stream,
            caption: media.caption,
        };
        const result = await session.api.sendMessage(messageObject, chatId);
        const sendResult = this.normalizeSendResult(result);
        const type = media.mimetype.startsWith("image/")
            ? "image"
            : media.mimetype.startsWith("video/")
                ? "video"
                : media.mimetype.startsWith("audio/")
                    ? "audio"
                    : "document";
        this.emit("message:create", {
            sessionName: name,
            message: this.buildSyntheticMessage(sendResult, session.currentUserID ?? "", chatId, media.caption ?? "", type, { mimetype: media.mimetype, filename: media.filename }),
        });
        this.emit("message:ack", sendResult.id, "delivered");
        return sendResult;
    }
    /**
     * Send a chat state indicator (typing / paused) to a chat.
     * Recording is not supported and throws.
     *
     * @throws if the session is not connected
     */
    async sendChatState(name, chatId, state) {
        const session = this.sessions.get(name);
        if (!session || session.status !== "connected" || !session.api) {
            throw new Error("Session not connected");
        }
        if (state === "recording") {
            throw new Error("Chat state 'recording' is not supported on Messenger");
        }
        const sendTyping = state === "typing";
        await session.api.sendTypingIndicator(sendTyping, chatId);
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
    /* ─── Private helpers ─── */
    setStatus(name, status) {
        const session = this.sessions.get(name);
        if (session) {
            session.status = status;
        }
    }
    setConnecting(name, value) {
        const session = this.sessions.get(name);
        if (session) {
            session.connecting = value;
        }
    }
    normalizeSendResult(result) {
        if (result && typeof result === "object") {
            return {
                id: String(result.messageID ?? result.id ?? ""),
                timestamp: Date.now(),
            };
        }
        return { id: String(result ?? ""), timestamp: Date.now() };
    }
    buildSyntheticMessage(sendResult, from, chatId, body, type, media) {
        return {
            id: sendResult.id,
            from,
            to: chatId,
            chatId,
            body,
            type,
            timestamp: sendResult.timestamp,
            fromMe: true,
            isGroup: false,
            media: media
                ? { mimetype: media.mimetype, filename: media.filename }
                : undefined,
            viewOnce: false,
            ephemeralDuration: undefined,
            isLidSender: false,
            senderPhone: null,
            pushName: null,
        };
    }
}
//# sourceMappingURL=engine.js.map