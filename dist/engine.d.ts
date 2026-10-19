import { EventEmitter } from "events";
import type { Logger, DestinationStream } from "pino";
import { type WAMessage } from "@whiskeysockets/baileys";
import type { IDatabaseAdapter, WhatsAppEngineConfig, ChatState, SendResult, MediaInput, EngineEventMap, ContactRecord, ChatRecord, IncomingMessage } from "./types/index.js";
export type ResolvedEngineConfig = Required<Omit<WhatsAppEngineConfig, "logger" | "logDestination">> & {
    logger?: Logger;
    logDestination?: DestinationStream;
};
export declare class WhatsAppEngine extends EventEmitter {
    private config;
    private logger;
    private sessions;
    private adapter;
    /** In-memory LID → phone lookup table shared across sessions. */
    private lidMap;
    /** Per-session in-memory message stores for Baileys retry protocol. */
    private messageStores;
    /** Deduplication cache for message:create events. */
    private createdMessageIds;
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
    private emitError;
    private emitMessageCreate;
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
    private resolveDeliverableJidAsync;
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
     * Download and decrypt media content from an incoming message or message ID.
     *
     * @param name — session name
     * @param message — IncomingMessage, raw WAMessage, or message ID (string)
     * @returns Buffer containing decrypted media bytes
     * @throws if session is not connected or message cannot be found
     */
    downloadMedia(name: string, message: IncomingMessage | WAMessage | string): Promise<Buffer>;
    /**
     * List contacts from the registered adapter, optionally filtered by session name.
     */
    listContacts(sessionName?: string): Promise<ContactRecord[]>;
    /**
     * List chats from the registered adapter, optionally filtered by session name.
     */
    listChats(sessionName?: string): Promise<ChatRecord[]>;
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