/**
 * Exponential backoff scheduler with jitter for reconnection attempts.
 *
 * Formula: delay = min(60_000, 1_000 × 2^(attempts-1)) + jitter
 * Jitter: ±15% of the base delay, capped at 1000ms max random addition.
 *
 * Terminal error codes (401, 403, 440) stop reconnection permanently.
 */
export declare const INITIAL_BACKOFF_MS = 1000;
export declare const MAX_BACKOFF_MS = 60000;
export declare const JITTER_FACTOR = 0.15;
export declare const MAX_JITTER_MS = 1000;
/** Error codes that indicate the session should not reconnect. */
export declare const TERMINAL_CODES: Set<number>;
/**
 * Calculate the delay for a given reconnection attempt.
 *
 * @param attempts — number of attempts already made (1-based)
 * @returns delay in milliseconds
 */
export declare function calculateBackoffDelay(attempts: number): number;
/**
 * Determine whether a disconnect status code is terminal.
 *
 * @param statusCode — the HTTP-like status code from the disconnect error
 * @returns true if reconnection should be aborted
 */
export declare function isTerminalError(statusCode: number | undefined): boolean;
/**
 * Classify a disconnect reason into terminal vs transient.
 *
 * @param statusCode — the disconnect status code
 * @returns "terminal" | "transient" | "unknown"
 */
export declare function classifyDisconnect(statusCode: number | undefined): "terminal" | "transient" | "unknown";
//# sourceMappingURL=backoff.d.ts.map