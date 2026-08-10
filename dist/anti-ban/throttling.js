/**
 * Bulk message throttling to avoid rate-limiting and ban triggers.
 *
 * Enforces a base delay between consecutive sends plus a random jitter.
 */
/** Default base delay between messages in milliseconds. */
export const DEFAULT_THROTTLE_BASE_MS = 3_000;
/** Default maximum random jitter in milliseconds. */
export const DEFAULT_THROTTLE_JITTER_MAX_MS = 2_000;
/**
 * Create a throttle that enforces delays between consecutive calls.
 *
 * @param baseDelay — minimum delay in ms (default 3000)
 * @param jitterMax — extra random delay in ms, 0..jitterMax (default 2000)
 * @returns Throttle instance
 */
export function createThrottle(baseDelay = DEFAULT_THROTTLE_BASE_MS, jitterMax = DEFAULT_THROTTLE_JITTER_MAX_MS) {
    let lastSendTime = 0;
    return {
        wait() {
            const now = Date.now();
            const elapsed = now - lastSendTime;
            const jitter = Math.floor(Math.random() * (jitterMax + 1));
            const required = baseDelay + jitter;
            const remaining = Math.max(0, required - elapsed);
            lastSendTime = now + remaining;
            return new Promise((resolve) => setTimeout(resolve, remaining));
        },
    };
}
//# sourceMappingURL=throttling.js.map