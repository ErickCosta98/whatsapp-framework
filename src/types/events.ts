/**
 * Event type definitions for the engine's EventEmitter interface.
 */

import type { IncomingMessage } from "./messages.js";

export type ConnectionStatus =
  | "initializing"
  | "qr"
  | "pairing_code"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "logged_out"
  | "failed";

export interface ConnectionEvent {
  sessionName: string;
  status: ConnectionStatus;
  /** QR code data URL (only when status is "qr"). */
  qr?: string;
  /** Pairing code (only when status is "pairing_code"). */
  pairingCode?: string;
  /** Phone number of the connected account (when available). */
  phone?: string | null;
  /** Push name of the connected account (when available). */
  pushName?: string | null;
  /** Human-readable reason for disconnect/failure. */
  reason?: string;
}

export interface MessageEvent {
  sessionName: string;
  message: IncomingMessage;
}

/**
 * Typed event map for the engine's EventEmitter.
 */
export interface EngineEventMap {
  connection: [ConnectionEvent];
  message: [MessageEvent];
  "message:create": [MessageEvent];
  "message:ack": [messageId: string, status: string];
  "message:revoked": [{ id: string; revokedId?: string; chatId: string; from: string; to: string; timestamp: number }];
  "message:reaction": [{ messageId: string; chatId: string; reaction: string; senderId: string }];
  error: [{ sessionName: string; error: Error }];
}
