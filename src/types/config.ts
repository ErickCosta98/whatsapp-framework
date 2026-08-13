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
   * Whether to download the full message history on initial sync.
   * When false (default), WhatsApp sends only the RECENT window +
   * the complete contact/app-state snapshot — which is what populates
   * LID mappings. Enable only if you need the full chat backlog.
   * Default: false.
   */
  syncFullHistory?: boolean;
}

export interface MessengerEngineConfig {
  /** Encrypted appState JSON string (preferred) or raw appState array. */
  appState?: string;
  /** Facebook email for login (alternative to appState). */
  email?: string;
  /** Facebook password for login (required with email). */
  password?: string;
  /** Pino log level. Default: "warn". */
  logLevel?: string;
  /** Maximum media upload size in bytes. Default: 50 MB. */
  mediaMaxSize?: number;
  /** Optional hook to encrypt appState before persisting to the adapter. */
  encryptAppState?: (plain: string) => string;
  /** Optional hook to decrypt appState after reading from the adapter. */
  decryptAppState?: (cipher: string) => string;
}

export type ChatState = "typing" | "recording" | "paused";
