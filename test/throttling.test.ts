import { describe, it, expect } from "vitest";
import {
  createThrottle,
  DEFAULT_THROTTLE_BASE_MS,
  DEFAULT_THROTTLE_JITTER_MAX_MS,
} from "../src/anti-ban/throttling.js";

describe("anti-ban/throttling", () => {
  it("enforces a base delay between consecutive sends", async () => {
    const throttle = createThrottle(200, 0);
    const start = Date.now();
    await throttle.wait();
    await throttle.wait();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(200 - 10);
  });

  it("adds random jitter within the configured max", async () => {
    const baseDelay = 50;
    const jitterMax = 50;
    const throttle = createThrottle(baseDelay, jitterMax);

    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      await throttle.wait();
      delays.push(Date.now() - t0);
    }

    // First call has no prior send, so it may be near-zero.
    // Subsequent calls must wait at least baseDelay.
    expect(delays[0]).toBeGreaterThanOrEqual(0);
    expect(delays[0]).toBeLessThanOrEqual(baseDelay + jitterMax + 20);

    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(baseDelay - 10);
      expect(delays[i]).toBeLessThanOrEqual(baseDelay + jitterMax + 20);
    }

    // Verify there is some variance (jitter is applied)
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("does not wait when enough time has already passed", async () => {
    const throttle = createThrottle(300, 0);
    await throttle.wait();
    await new Promise((r) => setTimeout(r, 350));
    const t0 = Date.now();
    await throttle.wait();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(50);
  });

  it("uses default values when called without arguments", async () => {
    const throttle = createThrottle();
    const t0 = Date.now();
    await throttle.wait();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThanOrEqual(
      DEFAULT_THROTTLE_BASE_MS + DEFAULT_THROTTLE_JITTER_MAX_MS + 50,
    );
  });
});
