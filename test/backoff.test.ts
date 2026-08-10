import { describe, it, expect } from "vitest";
import {
  calculateBackoffDelay,
  isTerminalError,
  classifyDisconnect,
  TERMINAL_CODES,
} from "../src/reconnect/backoff.js";

describe("reconnect/backoff", () => {
  describe("calculateBackoffDelay", () => {
    it("returns ~1000ms for the first attempt", () => {
      const delay = calculateBackoffDelay(1);
      expect(delay).toBeGreaterThanOrEqual(850);
      expect(delay).toBeLessThanOrEqual(1150);
    });

    it("doubles roughly every attempt", () => {
      const d1 = calculateBackoffDelay(1);
      const d2 = calculateBackoffDelay(2);
      const d3 = calculateBackoffDelay(3);
      expect(d2).toBeGreaterThan(d1);
      expect(d3).toBeGreaterThan(d2);
    });

    it("caps at 60000ms", () => {
      const delay = calculateBackoffDelay(10);
      expect(delay).toBeLessThanOrEqual(60_000 + 1_000);
    });

    it("never returns negative", () => {
      for (let i = 1; i <= 20; i++) {
        expect(calculateBackoffDelay(i)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("isTerminalError", () => {
    it("returns true for 401, 403, 440", () => {
      expect(isTerminalError(401)).toBe(true);
      expect(isTerminalError(403)).toBe(true);
      expect(isTerminalError(440)).toBe(true);
    });

    it("returns false for transient codes", () => {
      expect(isTerminalError(500)).toBe(false);
      expect(isTerminalError(502)).toBe(false);
      expect(isTerminalError(0)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isTerminalError(undefined)).toBe(false);
    });
  });

  describe("classifyDisconnect", () => {
    it("classifies terminal codes", () => {
      expect(classifyDisconnect(401)).toBe("terminal");
      expect(classifyDisconnect(403)).toBe("terminal");
      expect(classifyDisconnect(440)).toBe("terminal");
    });

    it("classifies unknown codes as transient", () => {
      expect(classifyDisconnect(500)).toBe("transient");
      expect(classifyDisconnect(0)).toBe("transient");
    });

    it("classifies undefined as unknown", () => {
      expect(classifyDisconnect(undefined)).toBe("unknown");
    });
  });

  describe("TERMINAL_CODES", () => {
    it("contains exactly 401, 403, 440", () => {
      expect([...TERMINAL_CODES].sort()).toEqual([401, 403, 440]);
    });
  });
});
