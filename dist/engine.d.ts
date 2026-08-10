import { EventEmitter } from "events";
import type { IDatabaseAdapter, WhatsAppEngineConfig, ChatState, SendResult, MediaInput, EngineEventMap } from "./types/index.js";
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
export declare class WhatsAppEngine extends EventEmitter {
    private config;
    private logger;
    private sessions;
    private adapter;
    /** In-memory LID → phone lookup table shared across sessions. */
    private lidMap;
    /** Per-session in-memory message stores for Baileys retry protocol. */
    private messageStores;
    constructor(config: WhatsAppEngineConfig);
    private resolveConfig;
    /**
     * Register a database adapter for session persistence, message storage,
     * and LID mapping. Must be called before `connect()`.
     */
    registerAdapter(adapter: IDatabaseAdapter): void;
    /**
     * Check whether a database adapter has been registered.
     */
    hasAdapter(): boolean;
    /**
     * Start a named session: load or create auth state, open a Baileys socket,
     * and begin listening for QR / connection events.
     *
     * @throws if no adapter is registered
     */
    connect(name: string): Promise<void>;
    private connectInner;
    /**
     * Gracefully stop a session: clear timers, end the socket, and update status.
     */
    disconnect(name: string): Promise<void>;
    /**
     * Stop all sessions and clean up resources.
     */
    stop(): Promise<void>;
    /**
     * Request a pairing code as an alternative to QR scanning.
     *
     * @throws if the session socket is not initialized
     * @throws if the session is already authenticated
     */
    requestPairingCode(name: string, phoneNumber: string): Promise<string>;
    /**
     * Send a text message through a connected session.
     *
     * @throws if the session is not connected
     */
    sendText(name: string, chatId: string, text: string): Promise<SendResult>;
    /**
     * Send media through a connected session.
     *
     * @throws if the session is not connected
     * @throws if media exceeds the configured size cap
     */
    sendMedia(name: string, chatId: string, media: MediaInput): Promise<SendResult>;
    /**
     * Send a chat state indicator (typing / recording / paused) to a chat.
     *
     * @throws if the session is not connected
     */
    sendChatState(name: string, chatId: string, state: ChatState): Promise<void>;
    /**
     * Get the current connection status of a session.
     */
    getStatus(name: string): string | undefined;
    /**
     * Get the QR code for a session (if available).
     */
    getQR(name: string): string | null;
    /**
     * Get the pairing code for a session (if available).
     */
    getPairingCode(name: string): string | null;
    /**
     * Return all managed session names.
     */
    listSessions(): string[];
    on<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this;
    once<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this;
    emit<K extends keyof EngineEventMap>(event: K, ...args: EngineEventMap[K]): boolean;
    private handleConnectionUpdate;
    private handleMessagesUpsert;
}
//# sourceMappingURL=engine.d.ts.map