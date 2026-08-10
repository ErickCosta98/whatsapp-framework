/**
 * Exponential backoff scheduler with jitter for reconnection attempts.
 *
 * Formula: delay = min(60_000, 1_000 × 2^(attempts-1)) + jitter
 * Jitter: ±15% of the base delay, capped at 1000ms max random addition.
 *
 * Terminal error codes (401, 403, 440) stop reconnection permanently.
 */
export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 60_000;
export const JITTER_FACTOR = 0.15;
export const MAX_JITTER_MS = 1_000;
/** Error codes that indicate the session should not reconnect. */
export const TERMINAL_CODES = new Set([
    401, // logged out / unauthorized
    403, // forbidden / banned
    440, // connection replaced
]);
/**
 * Calculate the delay for a given reconnection attempt.
 *
 * @param attempts — number of attempts already made (1-based)
 * @returns delay in milliseconds
 */
export function calculateBackoffDelay(attempts) {
    const base = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempts - 1));
    const jitterRange = Math.min(MAX_JITTER_MS, Math.floor(base * JITTER_FACTOR));
    const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
    return Math.max(0, base + jitter);
}
/**
 * Determine whether a disconnect status code is terminal.
 *
 * @param statusCode — the HTTP-like status code from the disconnect error
 * @returns true if reconnection should be aborted
 */
export function isTerminalError(statusCode) {
    if (statusCode === undefined)
        return false;
    return TERMINAL_CODES.has(statusCode);
}
/**
 * Classify a disconnect reason into terminal vs transient.
 *
 * @param statusCode — the disconnect status code
 * @returns "terminal" | "transient" | "unknown"
 */
export function classifyDisconnect(statusCode) {
    if (statusCode === undefined)
        return "unknown";
    if (TERMINAL_CODES.has(statusCode))
        return "terminal";
    return "transient";
}
//# sourceMappingURL=backoff.js.map