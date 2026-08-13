import { describe, it, expect } from "vitest";

// Static import sanity check for sub-path exports.
// If these lines compile, the exports map and barrel files are wired correctly.
import {
  MessengerEngine as SubPathMessengerEngine,
  createEngine as SubPathCreateEngine,
  normalizeMessengerMessage as SubPathNormalizer,
  bufferToReadStream as SubPathConverter,
} from "../src/messenger/index.js";

import {
  MessengerEngine as RootMessengerEngine,
  createEngine as RootCreateEngine,
  WhatsAppEngine,
  normalizeMessengerMessage as RootNormalizer,
  bufferToReadStream as RootConverter,
} from "../src/index.js";

describe("exports sanity", () => {
  it("sub-path MessengerEngine is the same class as root export", () => {
    expect(SubPathMessengerEngine).toBe(RootMessengerEngine);
  });

  it("sub-path createEngine is the same function as root export", () => {
    expect(SubPathCreateEngine).toBe(RootCreateEngine);
  });

  it("sub-path normalizer is the same function as root export", () => {
    expect(SubPathNormalizer).toBe(RootNormalizer);
  });

  it("sub-path media converter is the same function as root export", () => {
    expect(SubPathConverter).toBe(RootConverter);
  });

  it("can instantiate WhatsAppEngine from root export", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    expect(engine).toBeDefined();
    expect(engine.hasAdapter()).toBe(false);
  });
});
