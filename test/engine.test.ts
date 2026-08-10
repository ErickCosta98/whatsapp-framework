import { describe, it, expect } from "vitest";
import { WhatsAppEngine } from "../src/engine.js";

describe("WhatsAppEngine", () => {
  it("constructs with default config", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    expect(engine).toBeDefined();
    expect(engine.hasAdapter()).toBe(false);
  });

  it("registers an adapter", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const mockAdapter = {
      getSession: async () => null,
      upsertSession: async () => {},
      deleteSession: async () => {},
      getMessage: async () => null,
      putMessage: async () => {},
      clearSessionMessages: async () => {},
      getLidMapping: async () => null,
      upsertLidMapping: async () => {},
      listContacts: async () => [],
      upsertContact: async () => {},
      listChats: async () => [],
      upsertChat: async () => {},
    };
    engine.registerAdapter(mockAdapter);
    expect(engine.hasAdapter()).toBe(true);
  });

  it("throws on connect without adapter", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    await expect(engine.connect("bot-1")).rejects.toThrow(
      "Database adapter not registered",
    );
  });

  it("returns undefined status for unknown session", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    expect(engine.getStatus("unknown")).toBeUndefined();
  });

  it("starts with empty session list", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    expect(engine.listSessions()).toEqual([]);
  });

  it("emits typed events", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    let received = false;
    engine.on("connection", () => {
      received = true;
    });
    engine.emit("connection", { sessionName: "bot-1", status: "qr", qr: "test" });
    expect(received).toBe(true);
  });
});
