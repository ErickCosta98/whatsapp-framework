import { EventEmitter } from "events";
import type { Logger } from "pino";
import pino from "pino";

import type {
  IDatabaseAdapter,
  WhatsAppEngineConfig,
  ChatState,
  SendResult,
  MediaInput,
  EngineEventMap,
} from "./types/index.js";
import { SessionManager } from "./session.js";

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
  private config: Required<WhatsAppEngineConfig>;
  private logger: Logger;
  private sessions: SessionManager;
  private adapter: IDatabaseAdapter | null = null;

  /** In-memory fallback message store for Baileys retry protocol. */
  // TODO(phase-2): wire messageStore for Baileys retry protocol
  // private messageStore: Map<string, { key: unknown; message: unknown }> = new Map();
  // private static readonly DEFAULT_MESSAGE_STORE_CAP = 5_000;

  constructor(config: WhatsAppEngineConfig) {
    super();
    this.config = this.resolveConfig(config);
    this.logger = pino({ level: this.config.logLevel });
    this.sessions = new SessionManager();
  }

  /* ─── Configuration ─── */

  private resolveConfig(
    config: WhatsAppEngineConfig,
  ): Required<WhatsAppEngineConfig> {
    return {
      authDir: config.authDir,
      browser: config.browser ?? ["Gentle", "Chrome", "120.0.0"],
      markOnlineOnConnect: config.markOnlineOnConnect ?? false,
      simulateTyping: config.simulateTyping ?? true,
      simulateTypingMaxMs: config.simulateTypingMaxMs ?? 5_000,
      delayBetweenMessages: config.delayBetweenMessages ?? 3_000,
      randomizeDelay: config.randomizeDelay ?? true,
      messageStoreCap: config.messageStoreCap ?? 5_000,
      logLevel: config.logLevel ?? "warn",
    };
  }

  /* ─── Public API ─── */

  /**
   * Register a database adapter for session persistence, message storage,
   * and LID mapping. Must be called before `connect()`.
   */
  registerAdapter(adapter: IDatabaseAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Check whether a database adapter has been registered.
   */
  hasAdapter(): boolean {
    return this.adapter !== null;
  }

  /**
   * Start a named session: load or create auth state, open a Baileys socket,
   * and begin listening for QR / connection events.
   *
   * @throws if no adapter is registered
   */
  async connect(name: string): Promise<void> {
    if (!this.adapter) {
      throw new Error("Database adapter not registered");
    }
    // TODO: implement connection lifecycle in Phase 2
    this.logger.warn({ session: name }, "connect() not yet implemented");
  }

  /**
   * Gracefully stop a session: clear timers, end the socket, and update status.
   */
  async disconnect(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) {
      this.logger.warn({ session: name }, "disconnect called for unknown session");
      return;
    }

    this.sessions.clearReconnectTimer(name);
    this.sessions.markIntentionalClose(name);

    if (session.socket) {
      try {
        session.socket.end(undefined);
      } catch {
        // ignore
      }
      this.sessions.setSocket(name, null);
    }

    this.sessions.setStatus(name, "disconnected");
    this.emit("connection", {
      sessionName: name,
      status: "disconnected",
    });
  }

  /**
   * Stop all sessions and clean up resources.
   */
  async stop(): Promise<void> {
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
  async requestPairingCode(name: string, phoneNumber: string): Promise<string> {
    const session = this.sessions.get(name);
    if (!session || !session.socket) {
      throw new Error("Session not initialized");
    }
    if (session.status === "connected") {
      throw new Error("Already authenticated");
    }
    return session.socket.requestPairingCode(phoneNumber);
  }

  /**
   * Send a text message through a connected session.
   *
   * @throws if the session is not connected
   */
  async sendText(name: string, chatId: string, text: string): Promise<SendResult> {
    const session = this.sessions.get(name);
    if (!session || session.status !== "connected") {
      throw new Error("Session not connected");
    }
    // TODO: implement in Phase 2
    this.logger.warn({ session: name, chatId, text }, "sendText() not yet implemented");
    throw new Error("sendText() not yet implemented");
  }

  /**
   * Send media through a connected session.
   *
   * @throws if the session is not connected
   * @throws if media exceeds the configured size cap
   */
  async sendMedia(
    name: string,
    chatId: string,
    _media: MediaInput,
  ): Promise<SendResult> {
    const session = this.sessions.get(name);
    if (!session || session.status !== "connected") {
      throw new Error("Session not connected");
    }
    // TODO: implement in Phase 2
    this.logger.warn({ session: name, chatId }, "sendMedia() not yet implemented");
    throw new Error("sendMedia() not yet implemented");
  }

  /**
   * Send a chat state indicator (typing / recording / paused) to a chat.
   *
   * @throws if the session is not connected
   */
  async sendChatState(
    name: string,
    chatId: string,
    state: ChatState,
  ): Promise<void> {
    const session = this.sessions.get(name);
    if (!session || session.status !== "connected") {
      throw new Error("Session not connected");
    }
    // TODO: implement in Phase 2
    this.logger.warn({ session: name, chatId, state }, "sendChatState() not yet implemented");
    throw new Error("sendChatState() not yet implemented");
  }

  /**
   * Get the current connection status of a session.
   */
  getStatus(name: string): string | undefined {
    return this.sessions.status(name);
  }

  /**
   * Get the QR code for a session (if available).
   */
  getQR(name: string): string | null {
    return this.sessions.get(name)?.qr ?? null;
  }

  /**
   * Get the pairing code for a session (if available).
   */
  getPairingCode(name: string): string | null {
    return this.sessions.get(name)?.pairingCode ?? null;
  }

  /**
   * Return all managed session names.
   */
  listSessions(): string[] {
    return this.sessions.list();
  }

  /* ─── EventEmitter typing ─── */

  on<K extends keyof EngineEventMap>(
    event: K,
    listener: (...args: EngineEventMap[K]) => void,
  ): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  once<K extends keyof EngineEventMap>(
    event: K,
    listener: (...args: EngineEventMap[K]) => void,
  ): this {
    return super.once(event, listener as (...args: any[]) => void);
  }

  emit<K extends keyof EngineEventMap>(
    event: K,
    ...args: EngineEventMap[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  /* ─── Private ─── */

  /**
   * Store a message for the retry protocol. Uses a ring-buffer eviction
   * when the in-memory cap is reached (fallback when no adapter is registered).
   */
}
