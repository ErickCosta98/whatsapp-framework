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
    downloadMediaMessage: vi.fn(async () => Buffer.from("mock-decrypted-media")),
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
    updateMediaMessage: vi.fn(async (msg: any) => msg),
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

  it("getMessage unwraps inner proto.IMessage from stored WAMessage", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    adapter.getMessage.mockResolvedValue({
      keyId: "msg-123",
      message: {
        key: { id: "msg-123", remoteJid: "123@s.whatsapp.net" },
        message: { conversation: "hello proto" },
      },
      timestamp: 1234567,
    });
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const getMessage = vi.mocked(baileys.default).mock.calls[0][0].getMessage;
    const result = await getMessage({ id: "msg-123" });
    expect(result).toEqual({ conversation: "hello proto" });
  });

  it("requestPairingCode strips + before passing to Baileys", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());
    await engine.connect("bot-1");

    mockSocket.requestPairingCode.mockResolvedValue("1234-5678");
    await engine.requestPairingCode("bot-1", "+5215551234567");

    expect(mockSocket.requestPairingCode).toHaveBeenCalledWith("5215551234567");
  });

  it("sendMedia supports URL input without base64 corruption", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());
    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "media-url-id" },
      messageTimestamp: 1234567,
    });

    await engine.sendMedia("bot-1", "555@c.us", {
      mimetype: "image/png",
      data: "https://example.com/photo.png",
      caption: "cool photo",
    });

    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      "555@c.us",
      expect.objectContaining({
        image: { url: "https://example.com/photo.png" },
        mimetype: "image/png",
        caption: "cool photo",
      }),
    );
  });

  it("sendMedia supports sticker with image/webp", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    engine.registerAdapter(createMockAdapter());
    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "sticker-id" },
      messageTimestamp: 1234567,
    });

    const stickerBuffer = Buffer.from("fake-webp");
    await engine.sendMedia("bot-1", "555@c.us", {
      mimetype: "image/webp",
      data: stickerBuffer,
    });

    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      "555@c.us",
      expect.objectContaining({
        sticker: stickerBuffer,
        mimetype: "image/webp",
      }),
    );
  });

  it("emits error event when adapter fails without crashing", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    adapter.putMessage.mockRejectedValue(new Error("Database disk full"));
    engine.registerAdapter(adapter);

    const errors: any[] = [];
    engine.on("error", (ev) => errors.push(ev));

    await engine.connect("bot-1");
    mockSocket.ev.emit("messages.upsert", {
      messages: [
        {
          key: { id: "msg-err", remoteJid: "555@s.whatsapp.net" },
          messageTimestamp: 123,
          message: { conversation: "test" },
        },
      ],
      type: "notify",
    });

    // Allow promise microtasks to run
    await new Promise((r) => setTimeout(r, 10));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].sessionName).toBe("bot-1");
    expect(errors[0].error.message).toBe("Database disk full");
  });

  it("sendText sends composing presence update before typing delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const engine = new WhatsAppEngine({ authDir: "./auth", simulateTyping: true });
    engine.registerAdapter(createMockAdapter());

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "sent-text-1" },
      messageTimestamp: 1_700_000_000,
    });

    const sendPromise = engine.sendText("bot-1", "555@c.us", "anti-ban presence test");
    vi.advanceTimersByTime(10_000);
    await sendPromise;

    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith("composing", "555@c.us");
    expect(mockSocket.sendMessage).toHaveBeenCalledWith("555@c.us", { text: "anti-ban presence test" });

    vi.useRealTimers();
  });

  it("connect hydrates lidMap from adapter.listLidMappings", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth", simulateTyping: false });
    const adapter = createMockAdapter();
    adapter.listLidMappings = vi.fn(async () => [
      { lid: "hydrated@lid", pn: "5559999@s.whatsapp.net" },
    ]);
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    mockSocket.sendMessage.mockResolvedValue({
      key: { id: "sent-lid-msg" },
      messageTimestamp: 1_700_000_000,
    });

    await engine.sendText("bot-1", "hydrated@lid", "testing hydrated LID");

    // The hydrated LID should be resolved to 5559999@c.us
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      "5559999@c.us",
      { text: "testing hydrated LID" },
    );
  });

  it("engine.listContacts and engine.listChats delegate to adapter with sessionName", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    adapter.listContacts.mockResolvedValue([
      { id: "c-1", sessionName: "bot-1", name: "Alice" },
    ]);
    adapter.listChats.mockResolvedValue([
      { id: "ch-1", sessionName: "bot-1", name: "Alice Chat" },
    ]);
    engine.registerAdapter(adapter);

    const contacts = await engine.listContacts("bot-1");
    const chats = await engine.listChats("bot-1");

    expect(adapter.listContacts).toHaveBeenCalledWith("bot-1");
    expect(adapter.listChats).toHaveBeenCalledWith("bot-1");
    expect(contacts).toHaveLength(1);
    expect(chats).toHaveLength(1);
  });

  /* ─── downloadMedia & Event Wiring ─── */

  it("downloadMedia succeeds when given an IncomingMessage, WAMessage, or ID string", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    // 1. Throws if session not connected
    await expect(engine.downloadMedia("unknown-session", "msg-1")).rejects.toThrow(
      "Session not connected",
    );

    // 2. Incoming message arrives via upsert with media
    const mockMediaMsg = {
      key: { id: "media-1", remoteJid: "555@s.whatsapp.net", fromMe: false },
      message: {
        imageMessage: {
          mimetype: "image/jpeg",
          caption: "A photo",
        },
      },
      messageTimestamp: 1_700_000_000,
    };

    let receivedMsg: any = null;
    engine.on("message", ({ message }) => {
      receivedMsg = message;
    });

    mockSocket.ev.emit("messages.upsert", { messages: [mockMediaMsg], type: "notify" });
    expect(receivedMsg).not.toBeNull();
    expect(receivedMsg.raw).toBeDefined();

    // Download passing the IncomingMessage
    const buf1 = await engine.downloadMedia("bot-1", receivedMsg);
    expect(buf1).toEqual(Buffer.from("mock-decrypted-media"));

    // Download passing the message ID (retrieved from in-memory messageStore)
    const buf2 = await engine.downloadMedia("bot-1", "media-1");
    expect(buf2).toEqual(Buffer.from("mock-decrypted-media"));

    // Download passing a message stored in adapter
    adapter.getMessage.mockResolvedValueOnce({
      keyId: "adapter-media-id",
      message: mockMediaMsg,
    });
    const buf3 = await engine.downloadMedia("bot-1", "adapter-media-id");
    expect(buf3).toEqual(Buffer.from("mock-decrypted-media"));

    // Throws if message not found
    await expect(engine.downloadMedia("bot-1", "non-existent-id")).rejects.toThrow(
      "Message non-existent-id not found",
    );
  });

  it("emits message:ack when messages.update is received", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const acks: Array<{ id: string; status: string }> = [];
    engine.on("message:ack", (messageId, status) => {
      acks.push({ id: messageId, status });
    });

    mockSocket.ev.emit("messages.update", [
      { key: { id: "msg-1" }, update: { status: 2 } }, // SERVER_ACK
      { key: { id: "msg-2" }, update: { status: 3 } }, // DELIVERY_ACK
      { key: { id: "msg-3" }, update: { status: 4 } }, // READ
    ]);

    expect(acks).toEqual([
      { id: "msg-1", status: "server_ack" },
      { id: "msg-2", status: "delivery_ack" },
      { id: "msg-3", status: "read" },
    ]);
  });

  it("emits message:reaction when a reaction message arrives", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const reactions: any[] = [];
    engine.on("message:reaction", (ev) => {
      reactions.push(ev);
    });

    const reactionWAMessage = {
      key: { id: "reaction-msg-id", remoteJid: "5551234@s.whatsapp.net", fromMe: false },
      message: {
        reactionMessage: {
          key: { id: "target-msg-id", remoteJid: "5551234@s.whatsapp.net" },
          text: "🔥",
        },
      },
      messageTimestamp: 1_700_000_000,
    };

    mockSocket.ev.emit("messages.upsert", { messages: [reactionWAMessage], type: "notify" });

    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toEqual({
      messageId: "target-msg-id",
      chatId: "5551234@c.us",
      reaction: "🔥",
      senderId: "5551234@c.us",
    });
  });

  it("emits message:revoked when a revoke protocol message arrives", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const revokes: any[] = [];
    engine.on("message:revoked", (ev) => {
      revokes.push(ev);
    });

    const revokeWAMessage = {
      key: { id: "protocol-msg-id", remoteJid: "5551234@s.whatsapp.net", fromMe: false },
      message: {
        protocolMessage: {
          key: { id: "deleted-msg-id", remoteJid: "5551234@s.whatsapp.net" },
          type: baileys.proto.Message.ProtocolMessage.Type.REVOKE,
        },
      },
      messageTimestamp: 1_700_000_000,
    };

    mockSocket.ev.emit("messages.upsert", { messages: [revokeWAMessage], type: "notify" });

    expect(revokes).toHaveLength(1);
    expect(revokes[0]).toEqual({
      id: "protocol-msg-id",
      revokedId: "deleted-msg-id",
      chatId: "5551234@c.us",
      from: "5551234@c.us",
      to: "5551234@c.us",
      timestamp: 1_700_000_000,
    });
  });

  it("emits message:create on sendText, sendMedia, and fromMe upsert with deduplication", async () => {
    const engine = new WhatsAppEngine({ authDir: "./auth", simulateTyping: false });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    mockSocket.ev.emit("connection.update", { connection: "open" });

    const created: any[] = [];
    engine.on("message:create", ({ sessionName, message }) => {
      created.push({ sessionName, id: message.id, fromMe: message.fromMe, body: message.body });
    });

    mockSocket.sendMessage.mockResolvedValueOnce({
      key: { id: "created-text-1", remoteJid: "555@c.us", fromMe: true },
      message: { conversation: "hello created" },
      messageTimestamp: 1_700_000_000,
    });

    await engine.sendText("bot-1", "555@c.us", "hello created");

    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      sessionName: "bot-1",
      id: "created-text-1",
      fromMe: true,
      body: "hello created",
    });

    // Inbound message with fromMe=true (e.g. from primary phone / linked device)
    const phoneCreatedMsg = {
      key: { id: "created-phone-1", remoteJid: "555@s.whatsapp.net", fromMe: true },
      message: { conversation: "sent from phone" },
      messageTimestamp: 1_700_000_001,
    };
    mockSocket.ev.emit("messages.upsert", { messages: [phoneCreatedMsg], type: "notify" });

    expect(created).toHaveLength(2);
    expect(created[1].id).toBe("created-phone-1");
    expect(created[1].fromMe).toBe(true);

    // Re-delivering the same message does not duplicate message:create
    mockSocket.ev.emit("messages.upsert", { messages: [phoneCreatedMsg], type: "notify" });
    expect(created).toHaveLength(2);
  });
});
