/**
 * Simulated typing delay utilities for anti-ban protection.
 *
 * Formula: 500ms + text.length × 45ms, capped at 5000ms, with ±15% random jitter.
 */
/** Default maximum typing simulation duration in milliseconds. */
export declare const DEFAULT_TYPING_MAX_MS = 5000;
/** Base delay in milliseconds before length-scaled component. */
export declare const TYPING_BASE_MS = 500;
/** Milliseconds added per character of text. */
export declare const TYPING_PER_CHAR_MS = 45;
/** Jitter factor applied to the computed delay (±15%). */
export declare const TYPING_JITTER_FACTOR = 0.15;
/**
 * Calculate the typing delay for a given text length.
 *
 * @param textLength — number of characters in the message
 * @param maxMs — optional cap (default 5000ms)
 * @returns delay in milliseconds (synchronous; does not sleep)
 */
export declare function simulateTypingDelay(textLength: number, maxMs?: number): number;
/**
 * Async wrapper — actually sleeps for the computed typing delay.
 *
 * @param textLength — number of characters in the message
 * @param maxMs — optional cap (default 5000ms)
 * @returns Promise that resolves after the delay
 */
export declare function simulateTyping(textLength: number, maxMs?: number): Promise<void>;
//# sourceMappingURL=typing.d.ts.map