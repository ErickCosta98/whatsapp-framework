/**
 * Bulk message throttling to avoid rate-limiting and ban triggers.
 *
 * Enforces a base delay between consecutive sends plus a random jitter.
 */
/** Default base delay between messages in milliseconds. */
export declare const DEFAULT_THROTTLE_BASE_MS = 3000;
/** Default maximum random jitter in milliseconds. */
export declare const DEFAULT_THROTTLE_JITTER_MAX_MS = 2000;
export interface Throttle {
    /** Wait for the throttle delay before proceeding. */
    wait(): Promise<void>;
}
/**
 * Create a throttle that enforces delays between consecutive calls.
 *
 * @param baseDelay — minimum delay in ms (default 3000)
 * @param jitterMax — extra random delay in ms, 0..jitterMax (default 2000)
 * @returns Throttle instance
 */
export declare function createThrottle(baseDelay?: number, jitterMax?: number): Throttle;
//# sourceMappingURL=throttling.d.ts.map