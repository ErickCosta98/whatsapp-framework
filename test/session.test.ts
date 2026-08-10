import { describe, it, expect } from "vitest";
import { SessionManager } from "../src/session.js";

describe("SessionManager", () => {
  it("creates a new session", () => {
    const mgr = new SessionManager();
    const session = mgr.create("bot-1");
    expect(session.name).toBe("bot-1");
    expect(session.status).toBe("initializing");
    expect(session.socket).toBeNull();
  });

  it("returns existing session on duplicate create", () => {
    const mgr = new SessionManager();
    const s1 = mgr.create("bot-1");
    s1.status = "connected";
    const s2 = mgr.create("bot-1");
    expect(s2.status).toBe("connected");
    expect(s2).toBe(s1);
  });

  it("gets a session by name", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    expect(mgr.get("bot-1")).toBeDefined();
    expect(mgr.get("bot-2")).toBeUndefined();
  });

  it("tracks status", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    mgr.setStatus("bot-1", "connected");
    expect(mgr.status("bot-1")).toBe("connected");
  });

  it("tracks QR codes", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    mgr.setQR("bot-1", "qr-data");
    expect(mgr.get("bot-1")?.qr).toBe("qr-data");
    expect(mgr.status("bot-1")).toBe("qr");
  });

  it("tracks pairing codes", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    mgr.setPairingCode("bot-1", "ABCD-EFGH");
    expect(mgr.get("bot-1")?.pairingCode).toBe("ABCD-EFGH");
    expect(mgr.status("bot-1")).toBe("pairing_code");
  });

  it("tracks account info", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    mgr.setAccountInfo("bot-1", "+1234567890", "Test Bot");
    expect(mgr.get("bot-1")?.phone).toBe("+1234567890");
    expect(mgr.get("bot-1")?.pushName).toBe("Test Bot");
  });

  it("increments and resets reconnect attempts", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    expect(mgr.incrementReconnectAttempts("bot-1")).toBe(1);
    expect(mgr.incrementReconnectAttempts("bot-1")).toBe(2);
    mgr.resetReconnectAttempts("bot-1");
    expect(mgr.get("bot-1")?.reconnectAttempts).toBe(0);
  });

  it("destroys a session and clears timers", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    const timer = setTimeout(() => {}, 1000);
    mgr.setReconnectTimer("bot-1", timer);
    expect(mgr.destroy("bot-1")).toBe(true);
    expect(mgr.has("bot-1")).toBe(false);
  });

  it("lists all sessions", () => {
    const mgr = new SessionManager();
    mgr.create("bot-1");
    mgr.create("bot-2");
    expect(mgr.list()).toEqual(["bot-1", "bot-2"]);
    expect(mgr.count()).toBe(2);
  });
});
