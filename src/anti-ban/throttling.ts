/**
 * Bulk message throttling to avoid rate-limiting and ban triggers.
 *
 * Enforces a base delay between consecutive sends plus a random jitter.
 */

/** Default base delay between messages in milliseconds. */
export const DEFAULT_THROTTLE_BASE_MS = 3_000;

/** Default maximum random jitter in milliseconds. */
export const DEFAULT_THROTTLE_JITTER_MAX_MS = 2_000;

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
export function createThrottle(
  baseDelay: number = DEFAULT_THROTTLE_BASE_MS,
  jitterMax: number = DEFAULT_THROTTLE_JITTER_MAX_MS,
): Throttle {
  let lastSendTime = 0;

  return {
    wait(): Promise<void> {
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
