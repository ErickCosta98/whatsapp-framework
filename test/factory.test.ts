import { describe, it, expect } from "vitest";
import { createEngine } from "../src/factory.js";
import { WhatsAppEngine } from "../src/engine.js";
import { MessengerEngine } from "../src/messenger/engine.js";

describe("createEngine factory", () => {
  it("returns WhatsAppEngine for whatsapp platform", () => {
    const engine = createEngine("whatsapp", { authDir: "./auth" });
    expect(engine).toBeInstanceOf(WhatsAppEngine);
  });

  it("returns MessengerEngine for messenger platform", () => {
    const engine = createEngine("messenger", { appState: "[]" });
    expect(engine).toBeInstanceOf(MessengerEngine);
  });

  it("throws for unknown platform", () => {
    expect(() => createEngine("telegram" as any, {})).toThrow(
      "Unsupported platform: telegram",
    );
  });

  it("type narrowing works at compile time for whatsapp", () => {
    const engine = createEngine("whatsapp", { authDir: "./auth" });
    const _typeCheck: WhatsAppEngine = engine;
    expect(_typeCheck).toBe(engine);
    expect(typeof engine.requestPairingCode).toBe("function");
  });

  it("type narrowing works at compile time for messenger", () => {
    const engine = createEngine("messenger", { appState: "[]" });
    const _typeCheck: MessengerEngine = engine;
    expect(_typeCheck).toBe(engine);
    expect(typeof engine.sendText).toBe("function");
    expect(typeof engine.getQR).toBe("function");
  });
});
