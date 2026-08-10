import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhatsAppEngine } from "../src/engine.js";
import * as baileys from "@whiskeysockets/baileys";

/* ─── Mock Baileys module ─── */

let mockSocket: ReturnType<typeof createMockSocket>;

vi.mock("@whiskeysockets/baileys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@whiskeysockets/baileys")>();
  return {
    ...actual,
    default: vi.fn(() => mockSocket),
    useMultiFileAuthState: vi.fn(async () => ({
      state: { creds: {}, keys: {} },
      saveCreds: vi.fn(),
    })),
    fetchLatestBaileysVersion: vi.fn(async () => ({
      version: [2, 3000, 1015901307],
      isLatest: true,
    })),
    makeCacheableSignalKeyStore: vi.fn((keys: any) => keys),
  };
});

/* ─── Helpers ─── */

function createMockSocket(): any {
  const listeners = new Map<string, any[]>();
  return {
    ev: {
      on: vi.fn((event: string, handler: any) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(handler);
      }),
      removeAllListeners: vi.fn((event?: string) => {
        if (event) listeners.delete(event);
        else listeners.clear();
      }),
      emit: (event: string, ...args: any[]) => {
        listeners.get(event)?.forEach((h) => h(...args));
      },
    },
    sendMessage: vi.fn(),
    sendPresenceUpdate: vi.fn(),
    requestPairingCode: vi.fn(),
    end: vi.fn(),
    user: { id: "1234567890:1@s.whatsapp.net", name: "Test User" },
  };
}

function createMockAdapter(): any {
  return {
    getSession: vi.fn(async () => null),
    upsertSession: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
    getMessage: vi.fn(async () => null),
    putMessage: vi.fn(async () => {}),
    clearSessionMessages: vi.fn(async () => {}),
    getLidMapping: vi.fn(async () => null),
    upsertLidMapping: vi.fn(async () => {}),
    listContacts: vi.fn(async () => []),
    upsertContact: vi.fn(async () => {}),
    listChats: vi.fn(async () => []),
    upsertChat: vi.fn(async () => {}),
  };
}

/* ─── Per-test setup ─── */

beforeEach(() => {
  mockSocket = createMockSocket();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ─── Tests ─── */

describe("WhatsAppEngine lifecycle", () => {
  it("constructs with default config", () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    expect(engine).toBeDefined();
    expect(engine.hasAdapter()).toBe(false);
    expect(engine.listSessions()).toEqual([]);
  });

  it("connect creates socket and registers session", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    expect(baileys.useMultiFileAuthState).toHaveBeenCalled();
    expect(baileys.default).toHaveBeenCalled();
    expect(engine.getStatus("bot-1")).toBe("initializing");
    expect(engine.listSessions()).toContain("bot-1");
  });

  it("emits QR code via connection event", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { qr: "test-qr-data" });

    const qrEvent = events.find((e) => e.status === "qr");
    expect(qrEvent).toBeDefined();
    expect(qrEvent.qr).toBe("test-qr-data");
    expect(engine.getQR("bot-1")).toBe("test-qr-data");
  });

  it("emits connected event and stores phone", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const connected = events.find((e) => e.status === "connected");
    expect(connected).toBeDefined();
    expect(connected.phone).toBe("1234567890");
    expect(engine.getStatus("bot-1")).toBe("connected");
  });

  it("disconnect cleans up socket and timers", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    expect(engine.getStatus("bot-1")).toBe("initializing");

    await engine.disconnect("bot-1");

    expect(mockSocket.end).toHaveBeenCalled();
    expect(engine.getStatus("bot-1")).toBe("disconnected");
    expect(engine.listSessions()).toEqual(["bot-1"]);
  });

  it("emits logged_out on terminal close (401)", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", {
      connection: "close",
      lastDisconnect: {
        error: { output: { statusCode: 401 } },
      },
    });

    const loggedOut = events.find((e) => e.status === "logged_out");
    expect(loggedOut).toBeDefined();
    expect(engine.getStatus("bot-1")).toBe("logged_out");
  });

  it("schedules reconnect on transient close", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", {
      connection: "close",
      lastDisconnect: {
        error: { output: { statusCode: 408 } },
      },
    });

    const disconnected = events.find((e) => e.status === "disconnected");
    expect(disconnected).toBeDefined();
    expect(engine.getStatus("bot-1")).toBe("disconnected");

    // Verify reconnect timer was scheduled and attempt counter incremented.
    const session = (engine as any).sessions.get("bot-1");
    expect(session.reconnectTimer).not.toBeNull();
    expect(session.reconnectAttempts).toBe(1);
  });

  it("requestPairingCode validates session state", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    // Before connect
    await expect(engine.requestPairingCode("bot-1", "+1234567890")).rejects.toThrow(
      "Session not initialized",
    );

    await engine.connect("bot-1");
    mockSocket.requestPairingCode.mockResolvedValue("ABCD-EFGH");

    const code = await engine.requestPairingCode("bot-1", "+1234567890");
    expect(code).toBe("ABCD-EFGH");
    expect(engine.getPairingCode("bot-1")).toBe("ABCD-EFGH");

    // Invalid phone
    await expect(engine.requestPairingCode("bot-1", "bad-phone")).rejects.toThrow(
      "Invalid phone number format",
    );

    // Simulate connected state
    mockSocket.ev.emit("connection.update", { connection: "open" });
    await expect(engine.requestPairingCode("bot-1", "+1234567890")).rejects.toThrow(
      "Already authenticated",
    );
  });

  it("sendText resolves JID, applies typing delay, and sends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const engine = new WhatsAppEngine({ authDir: "./auth", simulateTyping: true });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "sent-1", remoteJid: "555@c.us" },
      messageTimestamp: 1_700_000_000,
    });

    const sendPromise = engine.sendText("bot-1", "555@c.us", "hello world");
    vi.advanceTimersByTime(10_000);
    const result = await sendPromise;

    expect(mockSocket.sendMessage).toHaveBeenCalledWith("555@c.us", { text: "hello world" });
    expect(result.id).toBe("sent-1");

    vi.useRealTimers();
  });

  it("sendText throws when session is not connected", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());
    await engine.connect("bot-1"); // still initializing, not open

    await expect(engine.sendText("bot-1", "555@c.us", "hi")).rejects.toThrow(
      "Session not connected",
    );
  });

  it("sendChatState calls sendPresenceUpdate", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    await engine.sendChatState("bot-1", "555@c.us", "typing");
    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith("composing", "555@c.us");

    await engine.sendChatState("bot-1", "555@c.us", "recording");
    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith("recording", "555@c.us");

    await engine.sendChatState("bot-1", "555@c.us", "paused");
    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith("paused", "555@c.us");
  });

  it("sendChatState throws when session is not connected", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());
    await engine.connect("bot-1");

    await expect(engine.sendChatState("bot-1", "555@c.us", "typing")).rejects.toThrow(
      "Session not connected",
    );
  });

  it("sendMedia validates size cap and sends", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth", mediaMaxSize: 1024 });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const oversized = { mimetype: "image/png", data: Buffer.alloc(2048) };
    await expect(engine.sendMedia("bot-1", "555@c.us", oversized)).rejects.toThrow(
      "Media exceeds size cap",
    );

    const valid = { mimetype: "image/png", data: Buffer.alloc(512) };
    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "sent-img", remoteJid: "555@c.us" },
      messageTimestamp: 1_700_000_001,
    });

    const result = await engine.sendMedia("bot-1", "555@c.us", valid);
    expect(mockSocket.sendMessage).toHaveBeenCalled();
    expect(result.id).toBe("sent-img");
  });

  it("message receive normalizes and emits", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    await engine.connect("bot-1");

    mockSocket.ev.emit("messages.upsert", {
      messages: [
        {
          key: {
            id: "msg-1",
            remoteJid: "5551111@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: { conversation: "hello there" },
        },
      ],
      type: "notify",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].sessionName).toBe("bot-1");
    expect(messages[0].message.body).toBe("hello there");
    expect(messages[0].message.type).toBe("text");
    expect(messages[0].message.from).toBe("5551111@c.us");

    expect(adapter.putMessage).toHaveBeenCalled();
  });

  it("captures LID mapping from remoteJidAlt", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    mockSocket.ev.emit("messages.upsert", {
      messages: [
        {
          key: {
            id: "lid-msg",
            remoteJid: "someone@lid",
            fromMe: false,
            remoteJidAlt: "5552222@s.whatsapp.net",
          },
          messageTimestamp: 1_700_000_000,
          message: { conversation: "lid hello" },
        },
      ],
      type: "notify",
    });

    expect(adapter.upsertLidMapping).toHaveBeenCalledWith("someone@lid", "5552222@s.whatsapp.net");
  });

  it("updates LID mappings from messaging-history.set", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    mockSocket.ev.emit("messaging-history.set", {
      lidPnMappings: [
        { lid: "lid1@lid", pn: "5553333@s.whatsapp.net" },
        { lid: "lid2@lid", pn: "5554444@s.whatsapp.net" },
      ],
    });

    expect(adapter.upsertLidMapping).toHaveBeenCalledWith("lid1@lid", "5553333@s.whatsapp.net");
    expect(adapter.upsertLidMapping).toHaveBeenCalledWith("lid2@lid", "5554444@s.whatsapp.net");
  });

  it("updates LID mappings from lid-mapping.update", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    mockSocket.ev.emit("lid-mapping.update", {
      lid: "lid3@lid",
      pn: "5555555@s.whatsapp.net",
    });

    expect(adapter.upsertLidMapping).toHaveBeenCalledWith("lid3@lid", "5555555@s.whatsapp.net");
  });

  it("persists contacts from contacts.upsert", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    mockSocket.ev.emit("contacts.upsert", [
      { id: "5556666@s.whatsapp.net", name: "Alice", notify: "Ali", phoneNumber: "5556666", isMyContact: true },
    ]);

    expect(adapter.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "5556666@s.whatsapp.net",
        name: "Alice",
        pushName: "Ali",
        number: "5556666",
        isMyContact: true,
      }),
    );
  });

  it("persists chats from chats.upsert", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");

    mockSocket.ev.emit("chats.upsert", [
      { id: "5557777@s.whatsapp.net", name: "Bob Chat", unreadCount: 3, lastMessageTimestamp: 1_700_000_000 },
    ]);

    expect(adapter.upsertChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "5557777@s.whatsapp.net",
        name: "Bob Chat",
        unreadCount: 3,
        lastMessageTimestamp: 1_700_000_000,
      }),
    );
  });

  it("stop disconnects all sessions", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    await engine.connect("bot-2");

    await engine.stop();

    expect(engine.listSessions()).toEqual(["bot-1", "bot-2"]);
  });

  it("creds.update triggers adapter session upsert", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });
    mockSocket.ev.emit("creds.update", {});

    // Allow async microtasks to flush
    await new Promise((r) => setTimeout(r, 10));

    expect(adapter.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "bot-1",
        status: "connected",
        phone: "1234567890",
      }),
    );
  });
});
