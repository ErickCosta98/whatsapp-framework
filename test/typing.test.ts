import { describe, it, expect } from "vitest";
import {
  simulateTypingDelay,
  simulateTyping,
  TYPING_BASE_MS,
  TYPING_PER_CHAR_MS,
  DEFAULT_TYPING_MAX_MS,
  TYPING_JITTER_FACTOR,
} from "../src/anti-ban/typing.js";

describe("anti-ban/typing", () => {
  describe("simulateTypingDelay", () => {
    it("returns ~500ms for empty text", () => {
      const delay = simulateTypingDelay(0);
      const expectedBase = TYPING_BASE_MS;
      const jitterRange = Math.floor(expectedBase * TYPING_JITTER_FACTOR);
      expect(delay).toBeGreaterThanOrEqual(expectedBase - jitterRange);
      expect(delay).toBeLessThanOrEqual(expectedBase + jitterRange);
    });

    it("scales with text length (500 + len * 45)", () => {
      const len = 10;
      const delay = simulateTypingDelay(len);
      const expectedBase = TYPING_BASE_MS + len * TYPING_PER_CHAR_MS;
      const jitterRange = Math.floor(expectedBase * TYPING_JITTER_FACTOR);
      expect(delay).toBeGreaterThanOrEqual(expectedBase - jitterRange);
      expect(delay).toBeLessThanOrEqual(expectedBase + jitterRange);
    });

    it("caps at 5000ms", () => {
      const delay = simulateTypingDelay(1_000);
      const maxJitter = Math.floor(DEFAULT_TYPING_MAX_MS * TYPING_JITTER_FACTOR);
      expect(delay).toBeLessThanOrEqual(DEFAULT_TYPING_MAX_MS + maxJitter);
    });

    it("respects a custom cap", () => {
      const customCap = 2_000;
      const delay = simulateTypingDelay(1_000, customCap);
      const maxJitter = Math.floor(customCap * TYPING_JITTER_FACTOR);
      expect(delay).toBeLessThanOrEqual(customCap + maxJitter);
    });

    it("jitter stays within ±15%", () => {
      for (let len of [0, 10, 50, 200]) {
        const base = Math.min(
          DEFAULT_TYPING_MAX_MS,
          TYPING_BASE_MS + len * TYPING_PER_CHAR_MS,
        );
        const jitterRange = Math.floor(base * TYPING_JITTER_FACTOR);
        for (let i = 0; i < 20; i++) {
          const delay = simulateTypingDelay(len);
          expect(delay).toBeGreaterThanOrEqual(base - jitterRange);
          expect(delay).toBeLessThanOrEqual(base + jitterRange);
          expect(delay).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("never returns negative", () => {
      for (let i = 0; i < 50; i++) {
        expect(simulateTypingDelay(0)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("simulateTyping", () => {
    it("resolves after a realistic delay", async () => {
      const start = Date.now();
      await simulateTyping(5);
      const elapsed = Date.now() - start;
      const expectedBase = TYPING_BASE_MS + 5 * TYPING_PER_CHAR_MS;
      const jitterRange = Math.floor(expectedBase * TYPING_JITTER_FACTOR);
      expect(elapsed).toBeGreaterThanOrEqual(expectedBase - jitterRange - 10);
      expect(elapsed).toBeLessThanOrEqual(expectedBase + jitterRange + 50);
    });
  });
});
