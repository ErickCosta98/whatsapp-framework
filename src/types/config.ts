/**
 * Engine configuration types.
 */

export interface WhatsAppEngineConfig {
  /** Directory for Baileys auth state files per session. */
  authDir: string;
  /** Browser identity tuple: [name, platform, version]. */
  browser?: [string, string, string];
  /** Whether to mark the account online on connect. Default: false. */
  markOnlineOnConnect?: boolean;
  /** Whether to simulate typing before text sends. Default: true. */
  simulateTyping?: boolean;
  /** Maximum typing simulation duration in milliseconds. Default: 5000. */
  simulateTypingMaxMs?: number;
  /** Base delay between bulk sends in milliseconds. Default: 3000. */
  delayBetweenMessages?: number;
  /** Add random extra delay (0–2000ms) between bulk sends. Default: true. */
  randomizeDelay?: boolean;
  /** Maximum number of messages stored per session for retry protocol. Default: 5000. */
  messageStoreCap?: number;
  /** Pino log level. Default: "warn". */
  logLevel?: string;
  /** Maximum media upload size in bytes. Default: 50 MB. */
  mediaMaxSize?: number;
  /**
   * Whether to sync message history on initial connection (populates LID
   * mappings). Enabling this on every reconnect causes 428 disconnects
   * under load — it should only fire on the first login.
   * Default: false.
   */
  syncHistoryOnConnect?: boolean;
}

export type ChatState = "typing" | "recording" | "paused";
