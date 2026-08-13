import { EventEmitter } from "events";
import type { IDatabaseAdapter, MessengerEngineConfig, ChatState, SendResult, MediaInput, EngineEventMap } from "../types/index.js";
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
export declare class MessengerEngine extends EventEmitter {
    private config;
    private logger;
    private sessions;
    private adapter;
    constructor(config: MessengerEngineConfig);
    /**
     * Register a database adapter for session persistence.
     * Must be called before `connect()`.
     */
    registerAdapter(adapter: IDatabaseAdapter): void;
    /**
     * Check whether a database adapter has been registered.
     */
    hasAdapter(): boolean;
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
    connect(name: string, appState?: string): Promise<void>;
    private connectInner;
    /**
     * Start listening for inbound events on a connected session.
     * Guards against double-listen.
     */
    private startListening;
    /**
     * Dispatch a single inbound nkxfca event to the appropriate engine emission.
     */
    private handleListenEvent;
    /**
     * Gracefully stop a session: clear API reference and update status.
     */
    disconnect(name: string): Promise<void>;
    /**
     * Stop all sessions and clean up resources.
     */
    stop(): Promise<void>;
    /**
     * Get the current connection status of a session.
     */
    getStatus(name: string): string | undefined;
    /**
     * Get the QR code for a session. Not supported for Messenger.
     * Always returns `null`.
     */
    getQR(_name: string): string | null;
    /**
     * Get the pairing code for a session. Not supported for Messenger.
     * Always returns `null`.
     */
    getPairingCode(_name: string): string | null;
    /**
     * Request a pairing code. Not supported for Messenger.
     * Always rejects.
     */
    requestPairingCode(_name: string, _phoneNumber: string): Promise<string>;
    /**
     * Return all managed session names.
     */
    listSessions(): string[];
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
     * Send a chat state indicator (typing / paused) to a chat.
     * Recording is not supported and throws.
     *
     * @throws if the session is not connected
     */
    sendChatState(name: string, chatId: string, state: ChatState): Promise<void>;
    on<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this;
    once<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this;
    emit<K extends keyof EngineEventMap>(event: K, ...args: EngineEventMap[K]): boolean;
    private setStatus;
    private setConnecting;
    private normalizeSendResult;
    private buildSyntheticMessage;
}
//# sourceMappingURL=engine.d.ts.map