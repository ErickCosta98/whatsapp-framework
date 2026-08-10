import type { WASocket } from "@whiskeysockets/baileys";
export type SessionStatus = "initializing" | "qr" | "pairing_code" | "connecting" | "connected" | "disconnected" | "reconnecting" | "logged_out" | "failed";
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
export declare class SessionManager {
    private sessions;
    /**
     * Create a new session entry if one does not already exist.
     */
    create(name: string): SessionInfo;
    /**
     * Retrieve a session by name, or undefined if not found.
     */
    get(name: string): SessionInfo | undefined;
    /**
     * Check whether a session exists.
     */
    has(name: string): boolean;
    /**
     * Remove a session from the store and clear its reconnection timer.
     */
    destroy(name: string): boolean;
    /**
     * Get the current status of a session.
     */
    status(name: string): SessionStatus | undefined;
    /**
     * Set the status of a session.
     */
    setStatus(name: string, status: SessionStatus): void;
    /**
     * Set the socket for a session.
     */
    setSocket(name: string, socket: WASocket | null): void;
    /**
     * Set the QR code for a session.
     */
    setQR(name: string, qr: string | null): void;
    /**
     * Set the pairing code for a session.
     */
    setPairingCode(name: string, code: string | null): void;
    /**
     * Set account metadata for a session.
     */
    setAccountInfo(name: string, phone: string | null, pushName: string | null): void;
    /**
     * Increment reconnect attempts and return the new count.
     */
    incrementReconnectAttempts(name: string): number;
    /**
     * Reset reconnect attempts to zero.
     */
    resetReconnectAttempts(name: string): void;
    /**
     * Set the reconnect timer for a session.
     */
    setReconnectTimer(name: string, timer: NodeJS.Timeout | null): void;
    /**
     * Clear the reconnect timer for a session.
     */
    clearReconnectTimer(name: string): void;
    /**
     * Mark a session as intentionally closing.
     */
    markIntentionalClose(name: string): void;
    /**
     * Clear the intentional-close flag.
     */
    clearIntentionalClose(name: string): void;
    /**
     * Set the connecting guard flag.
     */
    setConnecting(name: string, value: boolean): void;
    /**
     * Return all active session names.
     */
    list(): string[];
    /**
     * Return the count of managed sessions.
     */
    count(): number;
}
//# sourceMappingURL=session.d.ts.map