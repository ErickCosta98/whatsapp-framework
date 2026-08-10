/**
 * Manages the lifecycle and state of multiple WhatsApp sessions.
 *
 * Stores sessions in an in-memory Map keyed by session name.
 * Each session tracks its socket, connection status, QR/pairing data,
 * and reconnection bookkeeping.
 */
export class SessionManager {
    sessions = new Map();
    /**
     * Create a new session entry if one does not already exist.
     */
    create(name) {
        const existing = this.sessions.get(name);
        if (existing)
            return existing;
        const session = {
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
    get(name) {
        return this.sessions.get(name);
    }
    /**
     * Check whether a session exists.
     */
    has(name) {
        return this.sessions.has(name);
    }
    /**
     * Remove a session from the store and clear its reconnection timer.
     */
    destroy(name) {
        const session = this.sessions.get(name);
        if (!session)
            return false;
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
    status(name) {
        return this.sessions.get(name)?.status;
    }
    /**
     * Set the status of a session.
     */
    setStatus(name, status) {
        const session = this.sessions.get(name);
        if (session) {
            session.status = status;
        }
    }
    /**
     * Set the socket for a session.
     */
    setSocket(name, socket) {
        const session = this.sessions.get(name);
        if (session) {
            session.socket = socket;
        }
    }
    /**
     * Set the QR code for a session.
     */
    setQR(name, qr) {
        const session = this.sessions.get(name);
        if (session) {
            session.qr = qr;
            if (qr)
                session.status = "qr";
        }
    }
    /**
     * Set the pairing code for a session.
     */
    setPairingCode(name, code) {
        const session = this.sessions.get(name);
        if (session) {
            session.pairingCode = code;
            if (code)
                session.status = "pairing_code";
        }
    }
    /**
     * Set account metadata for a session.
     */
    setAccountInfo(name, phone, pushName) {
        const session = this.sessions.get(name);
        if (session) {
            session.phone = phone;
            session.pushName = pushName;
        }
    }
    /**
     * Increment reconnect attempts and return the new count.
     */
    incrementReconnectAttempts(name) {
        const session = this.sessions.get(name);
        if (!session)
            return 0;
        session.reconnectAttempts += 1;
        return session.reconnectAttempts;
    }
    /**
     * Reset reconnect attempts to zero.
     */
    resetReconnectAttempts(name) {
        const session = this.sessions.get(name);
        if (session) {
            session.reconnectAttempts = 0;
        }
    }
    /**
     * Set the reconnect timer for a session.
     */
    setReconnectTimer(name, timer) {
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
    clearReconnectTimer(name) {
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
    markIntentionalClose(name) {
        const session = this.sessions.get(name);
        if (session) {
            session.intentionalClose = true;
        }
    }
    /**
     * Clear the intentional-close flag.
     */
    clearIntentionalClose(name) {
        const session = this.sessions.get(name);
        if (session) {
            session.intentionalClose = false;
        }
    }
    /**
     * Set the connecting guard flag.
     */
    setConnecting(name, value) {
        const session = this.sessions.get(name);
        if (session) {
            session.connecting = value;
        }
    }
    /**
     * Return all active session names.
     */
    list() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Return the count of managed sessions.
     */
    count() {
        return this.sessions.size;
    }
}
//# sourceMappingURL=session.js.map