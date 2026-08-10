/**
 * Simulated typing delay utilities for anti-ban protection.
 *
 * Formula: 500ms + text.length × 45ms, capped at 5000ms, with ±15% random jitter.
 */

/** Default maximum typing simulation duration in milliseconds. */
export const DEFAULT_TYPING_MAX_MS = 5_000;

/** Base delay in milliseconds before length-scaled component. */
export const TYPING_BASE_MS = 500;

/** Milliseconds added per character of text. */
export const TYPING_PER_CHAR_MS = 45;

/** Jitter factor applied to the computed delay (±15%). */
export const TYPING_JITTER_FACTOR = 0.15;

/**
 * Calculate the typing delay for a given text length.
 *
 * @param textLength — number of characters in the message
 * @param maxMs — optional cap (default 5000ms)
 * @returns delay in milliseconds (synchronous; does not sleep)
 */
export function simulateTypingDelay(
  textLength: number,
  maxMs: number = DEFAULT_TYPING_MAX_MS,
): number {
  const base = TYPING_BASE_MS + textLength * TYPING_PER_CHAR_MS;
  const capped = Math.min(maxMs, base);
  const jitterRange = Math.floor(capped * TYPING_JITTER_FACTOR);
  const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
  return Math.max(0, capped + jitter);
}

/**
 * Async wrapper — actually sleeps for the computed typing delay.
 *
 * @param textLength — number of characters in the message
 * @param maxMs — optional cap (default 5000ms)
 * @returns Promise that resolves after the delay
 */
export function simulateTyping(
  textLength: number,
  maxMs: number = DEFAULT_TYPING_MAX_MS,
): Promise<void> {
  const delay = simulateTypingDelay(textLength, maxMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
