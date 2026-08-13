import { EventEmitter } from "events";
import type { Logger } from "pino";
import pino from "pino";
import type {
  IDatabaseAdapter,
  MessengerEngineConfig,
  ChatState,
  SendResult,
  MediaInput,
  EngineEventMap,
  ConnectionStatus,
  IncomingMessage,
  MessageType,
} from "../types/index.js";
import { loadMessengerClient, type MessengerAPI } from "./client-loader.js";
import { bufferToReadStream } from "./media-converter.js";
import { normalizeMessengerMessage } from "./normalizer.js";
import { DEFAULT_MEDIA_CAP_BYTES } from "../normalizer.js";

interface MessengerSessionInfo {
  name: string;
  api: MessengerAPI | null;
  status: ConnectionStatus;
  currentUserID: string | null;
  connecting: boolean;
  listening: boolean;
}

function resolveConfig(
  config: MessengerEngineConfig,
): Required<MessengerEngineConfig> {
  return {
    appState: config.appState ?? "",
    email: config.email ?? "",
    password: config.password ?? "",
    logLevel: config.logLevel ?? "warn",
    mediaMaxSize: config.mediaMaxSize ?? DEFAULT_MEDIA_CAP_BYTES,
    encryptAppState: config.encryptAppState ?? ((plain: string) => plain),
    decryptAppState: config.decryptAppState ?? ((cipher: string) => cipher),
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
  private config: Required<MessengerEngineConfig>;
  private logger: Logger;
  private sessions = new Map<string, MessengerSessionInfo>();
  private adapter: IDatabaseAdapter | null = null;

  constructor(config: MessengerEngineConfig) {
    super();
    this.config = resolveConfig(config);
    this.logger = pino({ level: this.config.logLevel });
  }

  /**
   * Register a database adapter for session persistence.
   * Must be called before `connect()`.
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
   * Start a named session: load or restore appState, call nkxfca login,
   * store the API, and emit connection events.
   *
   * If no explicit `appState` is provided and `config.appState` is empty,
   * attempts to restore encrypted appState from the adapter and decrypt
   * it via `config.decryptAppState`.
   *
   * @throws if no adapter is registered
   */
  async connect(name: string, appState?: string): Promise<void> {
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
    } finally {
      this.setConnecting(name, false);
    }
  }

  private async connectInner(
    name: string,
    explicitAppState?: string,
  ): Promise<void> {
    this.emit("connection", { sessionName: name, status: "initializing" });

    let appState = explicitAppState ?? this.config.appState;

    if (!appState && this.adapter) {
      const record = await this.adapter.getSession(name);
      if (record?.appState) {
        appState = this.config.decryptAppState(record.appState);
      }
    }

    const client = await loadMessengerClient();

    const credentials: Record<string, any> = {};
    if (appState) {
      try {
        credentials.appState = JSON.parse(appState);
      } catch {
        credentials.appState = appState;
      }
    } else if (this.config.email && this.config.password) {
      credentials.email = this.config.email;
      credentials.password = this.config.password;
    }

    this.setStatus(name, "connecting");
    this.emit("connection", { sessionName: name, status: "connecting" });

    try {
      const api = (await client.login(credentials)) as MessengerAPI;
      if (!api) {
        throw new Error("Messenger login did not return an API instance");
      }

      const session = this.sessions.get(name)!;
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
    } catch (err: any) {
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
  private startListening(name: string, api: MessengerAPI): void {
    const session = this.sessions.get(name);
    if (!session || session.listening) return;

    session.listening = true;

    api.listenMqtt((err: any, event: any) => {
      if (!session.listening) return;

      if (err) {
        this.logger.warn(
          { session: name, error: err },
          "listenMqtt callback error",
        );
        return;
      }

      try {
        this.handleListenEvent(name, event);
      } catch (handlerErr: any) {
        this.logger.warn(
          { session: name, error: handlerErr?.message ?? handlerErr },
          "listenMqtt event handler error",
        );
      }
    });
  }

  /**
   * Dispatch a single inbound nkxfca event to the appropriate engine emission.
   */
  private handleListenEvent(name: string, event: any): void {
    if (!event || typeof event !== "object") return;

    const session = this.sessions.get(name);
    if (!session) return;

    switch (event.type) {
      case "message":
      case "message_reply": {
        const normalized = normalizeMessengerMessage(
          event,
          session.currentUserID ?? "",
        );
        this.emit("message", { sessionName: name, message: normalized });
        break;
      }
      case "unsend":
      case "message_unsend": {
        const timestamp = Number(
          event.deletionTimestamp ?? event.timestamp ?? Date.now(),
        );
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
  async disconnect(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) {
      this.logger.warn(
        { session: name },
        "disconnect called for unknown session",
      );
      return;
    }

    session.listening = false;

    if (session.api?.stopListening) {
      try {
        session.api.stopListening();
      } catch {
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
  async stop(): Promise<void> {
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
  getStatus(name: string): string | undefined {
    return this.sessions.get(name)?.status;
  }

  /**
   * Get the QR code for a session. Not supported for Messenger.
   * Always returns `null`.
   */
  getQR(_name: string): string | null {
    return null;
  }

  /**
   * Get the pairing code for a session. Not supported for Messenger.
   * Always returns `null`.
   */
  getPairingCode(_name: string): string | null {
    return null;
  }

  /**
   * Request a pairing code. Not supported for Messenger.
   * Always rejects.
   */
  requestPairingCode(_name: string, _phoneNumber: string): Promise<string> {
    return Promise.reject(
      new Error("Not supported for Messenger platform"),
    );
  }

  /**
   * Return all managed session names.
   */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Send a text message through a connected session.
   *
   * @throws if the session is not connected
   */
  async sendText(
    name: string,
    chatId: string,
    text: string,
  ): Promise<SendResult> {
    const session = this.sessions.get(name);
    if (!session || session.status !== "connected" || !session.api) {
      throw new Error("Session not connected");
    }

    const result = await session.api.sendMessage(text, chatId);
    const sendResult = this.normalizeSendResult(result);

    this.emit("message:create", {
      sessionName: name,
      message: this.buildSyntheticMessage(
        sendResult,
        session.currentUserID ?? "",
        chatId,
        text,
        "text",
      ),
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
  async sendMedia(
    name: string,
    chatId: string,
    media: MediaInput,
  ): Promise<SendResult> {
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

    const type: MessageType = media.mimetype.startsWith("image/")
      ? "image"
      : media.mimetype.startsWith("video/")
        ? "video"
        : media.mimetype.startsWith("audio/")
          ? "audio"
          : "document";

    this.emit("message:create", {
      sessionName: name,
      message: this.buildSyntheticMessage(
        sendResult,
        session.currentUserID ?? "",
        chatId,
        media.caption ?? "",
        type,
        { mimetype: media.mimetype, filename: media.filename },
      ),
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
  async sendChatState(
    name: string,
    chatId: string,
    state: ChatState,
  ): Promise<void> {
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

  /* ─── Private helpers ─── */

  private setStatus(name: string, status: ConnectionStatus): void {
    const session = this.sessions.get(name);
    if (session) {
      session.status = status;
    }
  }

  private setConnecting(name: string, value: boolean): void {
    const session = this.sessions.get(name);
    if (session) {
      session.connecting = value;
    }
  }

  private normalizeSendResult(result: any): SendResult {
    if (result && typeof result === "object") {
      return {
        id: String(result.messageID ?? result.id ?? ""),
        timestamp: Date.now(),
      };
    }
    return { id: String(result ?? ""), timestamp: Date.now() };
  }

  private buildSyntheticMessage(
    sendResult: SendResult,
    from: string,
    chatId: string,
    body: string,
    type: MessageType,
    media?: { mimetype: string; filename?: string },
  ): IncomingMessage {
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
