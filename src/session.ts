import type { WASocket } from "@whiskeysockets/baileys";

export type SessionStatus =
  | "initializing"
  | "qr"
  | "pairing_code"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "logged_out"
  | "failed";

export interface SessionInfo {
  name: string;
  socket: WASocket | null;
  status: SessionStatus;
  qr: string | null;
  pairingCode: string | null;
  phone: string | null;
  pushName: string | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  intentionalClose: boolean;
  connecting: boolean;
}

/**
 * Manages the lifecycle and state of multiple WhatsApp sessions.
 *
 * Stores sessions in an in-memory Map keyed by session name.
 * Each session tracks its socket, connection status, QR/pairing data,
 * and reconnection bookkeeping.
 */
export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();

  /**
   * Create a new session entry if one does not already exist.
   */
  create(name: string): SessionInfo {
    const existing = this.sessions.get(name);
    if (existing) return existing;

    const session: SessionInfo = {
      name,
      socket: null,
      status: "initializing",
      qr: null,
      pairingCode: null,
      phone: null,
      pushName: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      intentionalClose: false,
      connecting: false,
    };
    this.sessions.set(name, session);
    return session;
  }

  /**
   * Retrieve a session by name, or undefined if not found.
   */
  get(name: string): SessionInfo | undefined {
    return this.sessions.get(name);
  }

  /**
   * Check whether a session exists.
   */
  has(name: string): boolean {
    return this.sessions.has(name);
  }

  /**
   * Remove a session from the store and clear its reconnection timer.
   */
  destroy(name: string): boolean {
    const session = this.sessions.get(name);
    if (!session) return false;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    this.sessions.delete(name);
    return true;
  }

  /**
   * Get the current status of a session.
   */
  status(name: string): SessionStatus | undefined {
    return this.sessions.get(name)?.status;
  }

  /**
   * Set the status of a session.
   */
  setStatus(name: string, status: SessionStatus): void {
    const session = this.sessions.get(name);
    if (session) {
      session.status = status;
    }
  }

  /**
   * Set the socket for a session.
   */
  setSocket(name: string, socket: WASocket | null): void {
    const session = this.sessions.get(name);
    if (session) {
      session.socket = socket;
    }
  }

  /**
   * Set the QR code for a session.
   */
  setQR(name: string, qr: string | null): void {
    const session = this.sessions.get(name);
    if (session) {
      session.qr = qr;
      if (qr) session.status = "qr";
    }
  }

  /**
   * Set the pairing code for a session.
   */
  setPairingCode(name: string, code: string | null): void {
    const session = this.sessions.get(name);
    if (session) {
      session.pairingCode = code;
      if (code) session.status = "pairing_code";
    }
  }

  /**
   * Set account metadata for a session.
   */
  setAccountInfo(
    name: string,
    phone: string | null,
    pushName: string | null,
  ): void {
    const session = this.sessions.get(name);
    if (session) {
      session.phone = phone;
      session.pushName = pushName;
    }
  }

  /**
   * Increment reconnect attempts and return the new count.
   */
  incrementReconnectAttempts(name: string): number {
    const session = this.sessions.get(name);
    if (!session) return 0;
    session.reconnectAttempts += 1;
    return session.reconnectAttempts;
  }

  /**
   * Reset reconnect attempts to zero.
   */
  resetReconnectAttempts(name: string): void {
    const session = this.sessions.get(name);
    if (session) {
      session.reconnectAttempts = 0;
    }
  }

  /**
   * Set the reconnect timer for a session.
   */
  setReconnectTimer(name: string, timer: NodeJS.Timeout | null): void {
    const session = this.sessions.get(name);
    if (session) {
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
      }
      session.reconnectTimer = timer;
    }
  }

  /**
   * Clear the reconnect timer for a session.
   */
  clearReconnectTimer(name: string): void {
    const session = this.sessions.get(name);
    if (session) {
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }
    }
  }

  /**
   * Mark a session as intentionally closing.
   */
  markIntentionalClose(name: string): void {
    const session = this.sessions.get(name);
    if (session) {
      session.intentionalClose = true;
    }
  }

  /**
   * Clear the intentional-close flag.
   */
  clearIntentionalClose(name: string): void {
    const session = this.sessions.get(name);
    if (session) {
      session.intentionalClose = false;
    }
  }

  /**
   * Set the connecting guard flag.
   */
  setConnecting(name: string, value: boolean): void {
    const session = this.sessions.get(name);
    if (session) {
      session.connecting = value;
    }
  }

  /**
   * Return all active session names.
   */
  list(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Return the count of managed sessions.
   */
  count(): number {
    return this.sessions.size;
  }
}
