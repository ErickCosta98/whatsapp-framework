import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessengerEngine } from "../../src/messenger/engine.js";

let mockApi: ReturnType<typeof createMockApi>;

function createMockApi() {
  return {
    getCurrentUserID: vi.fn(() => "user-123"),
    listenMqtt: vi.fn(),
    sendMessage: vi.fn(async (_message: any, _threadID: string) => ({
      messageID: "msg-1",
      threadID: _threadID,
    })),
    sendTypingIndicator: vi.fn(async () => {}),
    stopListening: vi.fn(),
  };
}

function createMockAdapter() {
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

vi.mock("../../src/messenger/client-loader.js", () => ({
  loadMessengerClient: vi.fn(async () => ({
    login: vi.fn(async () => mockApi),
  })),
}));

beforeEach(() => {
  mockApi = createMockApi();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ─── Lifecycle ─── */

describe("MessengerEngine lifecycle", () => {
  it("constructs with default config", () => {
    const engine = new MessengerEngine({});
    expect(engine).toBeDefined();
    expect(engine.hasAdapter()).toBe(false);
    expect(engine.listSessions()).toEqual([]);
  });

  it("registers an adapter", () => {
    const engine = new MessengerEngine({});
    engine.registerAdapter(createMockAdapter());
    expect(engine.hasAdapter()).toBe(true);
  });

  it("throws on connect without adapter", async () => {
    const engine = new MessengerEngine({});
    await expect(engine.connect("bot-1")).rejects.toThrow(
      "Database adapter not registered",
    );
  });

  it("connects and emits status events in order", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");

    expect(engine.getStatus("bot-1")).toBe("connected");
    expect(events.map((e) => e.status)).toEqual([
      "initializing",
      "connecting",
      "connected",
    ]);
  });

  it("restores session from adapter when no appState provided", async () => {
    const engine = new MessengerEngine({});
    const adapter = createMockAdapter();
    adapter.getSession.mockResolvedValue({
      name: "bot-1",
      status: "disconnected",
      appState: "encrypted-state",
    });
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    expect(adapter.getSession).toHaveBeenCalledWith("bot-1");
    expect(engine.getStatus("bot-1")).toBe("connected");
  });

  it("restores session with decryptAppState hook", async () => {
    const engine = new MessengerEngine({
      decryptAppState: (cipher) => cipher.replace("enc-", ""),
    });
    const adapter = createMockAdapter();
    adapter.getSession.mockResolvedValue({
      name: "bot-1",
      status: "disconnected",
      appState: "enc-real-state",
    });
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    expect(adapter.getSession).toHaveBeenCalledWith("bot-1");
    expect(engine.getStatus("bot-1")).toBe("connected");
  });

  it("persists encrypted appState after connect", async () => {
    const engine = new MessengerEngine({
      appState: "my-state",
      encryptAppState: (plain) => `enc-${plain}`,
    });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    expect(adapter.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "bot-1",
        status: "connected",
        platform: "messenger",
        appState: "enc-my-state",
      }),
    );
  });

  it("emits failed and error on login failure", async () => {
    const engine = new MessengerEngine({ appState: "bad-state" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    mockApi = {
      ...createMockApi(),
      getCurrentUserID: vi.fn(() => {
        throw new Error("Login failed");
      }),
    } as any;

    const connectionEvents: any[] = [];
    const errorEvents: any[] = [];
    engine.on("connection", (ev) => connectionEvents.push(ev));
    engine.on("error", (ev) => errorEvents.push(ev));

    await expect(engine.connect("bot-1")).rejects.toThrow("Login failed");

    const failed = connectionEvents.find((e) => e.status === "failed");
    expect(failed).toBeDefined();
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].sessionName).toBe("bot-1");
  });

  it("disconnect stops session and emits disconnected", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    const events: any[] = [];
    engine.on("connection", (ev) => events.push(ev));

    await engine.connect("bot-1");
    await engine.disconnect("bot-1");

    expect(engine.getStatus("bot-1")).toBe("disconnected");
    const disconnected = events.find((e) => e.status === "disconnected");
    expect(disconnected).toBeDefined();
  });

  it("disconnect warns for unknown session", async () => {
    const engine = new MessengerEngine({});
    await engine.disconnect("unknown");
    // Should not throw
  });

  it("stop disconnects all sessions and removes listeners", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    await engine.connect("bot-1");
    await engine.connect("bot-2");

    let received = false;
    engine.on("connection", () => {
      received = true;
    });

    await engine.stop();

    // Reset after stop — disconnect events during stop may have fired the
    // listener, but removeAllListeners() should have cleared it afterward.
    received = false;
    engine.emit("connection", { sessionName: "x", status: "failed" });
    expect(received).toBe(false);
  });

  it("getQR returns null", () => {
    const engine = new MessengerEngine({});
    expect(engine.getQR("bot-1")).toBeNull();
  });

  it("getPairingCode returns null", () => {
    const engine = new MessengerEngine({});
    expect(engine.getPairingCode("bot-1")).toBeNull();
  });

  it("requestPairingCode throws", async () => {
    const engine = new MessengerEngine({});
    await expect(
      engine.requestPairingCode("bot-1", "+1234567890"),
    ).rejects.toThrow("Not supported for Messenger platform");
  });

  it("connect is idempotent when already in progress", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);

    // Slow down login so we can call connect again while it's running
    mockApi = {
      ...createMockApi(),
      getCurrentUserID: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "user-123";
      }),
    } as any;

    const p1 = engine.connect("bot-1");
    const p2 = engine.connect("bot-1");

    await Promise.all([p1, p2]);
    expect(engine.getStatus("bot-1")).toBe("connected");
  });
});

/* ─── Sending ─── */

describe("MessengerEngine sending", () => {
  it("sendText returns SendResult and emits synthetic ack", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const acks: any[] = [];
    const creates: any[] = [];
    engine.on("message:ack", (id, status) => acks.push({ id, status }));
    engine.on("message:create", (ev) => creates.push(ev));

    mockApi.sendMessage.mockResolvedValue({ messageID: "msg-123" });

    const result = await engine.sendText("bot-1", "thread-1", "hello");
    expect(result.id).toBe("msg-123");
    expect(acks).toEqual([{ id: "msg-123", status: "delivered" }]);
    expect(creates).toHaveLength(1);
    expect(creates[0].sessionName).toBe("bot-1");
    expect(creates[0].message.id).toBe("msg-123");
    expect(creates[0].message.body).toBe("hello");
    expect(creates[0].message.fromMe).toBe(true);
  });

  it("sendText throws when not connected", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");
    await engine.disconnect("bot-1");

    await expect(
      engine.sendText("bot-1", "thread-1", "hi"),
    ).rejects.toThrow("Session not connected");
  });

  it("sendMedia validates size cap", async () => {
    const engine = new MessengerEngine({
      appState: "[]",
      mediaMaxSize: 1024,
    });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const oversized = {
      mimetype: "image/png",
      data: Buffer.alloc(2048),
    };
    await expect(
      engine.sendMedia("bot-1", "thread-1", oversized),
    ).rejects.toThrow("Media exceeds size cap");
  });

  it("sendMedia converts buffer and sends with attachment", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const acks: any[] = [];
    engine.on("message:ack", (id, status) => acks.push({ id, status }));

    mockApi.sendMessage.mockResolvedValue({ messageID: "media-1" });

    const media = {
      mimetype: "image/png",
      data: Buffer.from("fake-image"),
      caption: "pic",
    };
    const result = await engine.sendMedia("bot-1", "thread-1", media);
    expect(result.id).toBe("media-1");
    expect(acks).toEqual([{ id: "media-1", status: "delivered" }]);

    const callArg = mockApi.sendMessage.mock.calls[0][0];
    expect(callArg).toHaveProperty("attachment");
    expect(callArg).toHaveProperty("caption", "pic");
  });

  it("sendMedia throws when not connected", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");
    await engine.disconnect("bot-1");

    const media = { mimetype: "image/png", data: Buffer.alloc(100) };
    await expect(
      engine.sendMedia("bot-1", "thread-1", media),
    ).rejects.toThrow("Session not connected");
  });

  it("sendChatState typing works", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    await engine.sendChatState("bot-1", "thread-1", "typing");
    expect(mockApi.sendTypingIndicator).toHaveBeenCalledWith(true, "thread-1");
  });

  it("sendChatState paused works", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    await engine.sendChatState("bot-1", "thread-1", "paused");
    expect(mockApi.sendTypingIndicator).toHaveBeenCalledWith(
      false,
      "thread-1",
    );
  });

  it("sendChatState recording throws", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    await expect(
      engine.sendChatState("bot-1", "thread-1", "recording"),
    ).rejects.toThrow("Chat state 'recording' is not supported on Messenger");
  });

  it("sendChatState throws when not connected", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");
    await engine.disconnect("bot-1");

    await expect(
      engine.sendChatState("bot-1", "thread-1", "typing"),
    ).rejects.toThrow("Session not connected");
  });
});

/* ─── Inbound events ─── */

describe("MessengerEngine inbound events", () => {
  it("emits message event for inbound text message", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message",
      senderID: "sender-1",
      body: "hello world",
      threadID: "thread-1",
      messageID: "msg-1",
      attachments: [],
      mentions: {},
      timestamp: "1690000000000",
      isGroup: false,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].sessionName).toBe("bot-1");
    expect(messages[0].message.id).toBe("msg-1");
    expect(messages[0].message.body).toBe("hello world");
    expect(messages[0].message.type).toBe("text");
    expect(messages[0].message.from).toBe("sender-1");
    expect(messages[0].message.chatId).toBe("thread-1");
    expect(messages[0].message.fromMe).toBe(false);
  });

  it("emits message event with fromMe true for self messages", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message",
      senderID: "user-123",
      body: "self message",
      threadID: "thread-1",
      messageID: "msg-self",
      attachments: [],
      mentions: {},
      timestamp: "1690000000000",
      isGroup: false,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].message.fromMe).toBe(true);
  });

  it("emits message event for inbound message_reply", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message_reply",
      senderID: "sender-1",
      body: "reply text",
      threadID: "thread-1",
      messageID: "msg-2",
      attachments: [],
      mentions: {},
      timestamp: "1690000000001",
      isGroup: false,
      messageReply: {
        messageID: "msg-0",
        senderID: "sender-2",
        body: "original",
        attachments: [],
        timestamp: "1690000000000",
        isReply: true,
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].message.quotedMessage).toEqual({
      id: "msg-0",
      body: "original",
    });
  });

  it("emits message:revoked for unsend event", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const revoked: any[] = [];
    engine.on("message:revoked", (ev) => revoked.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message_unsend",
      messageID: "msg-1",
      threadID: "thread-1",
      senderID: "sender-1",
      deletionTimestamp: "1690000000000",
    });

    expect(revoked).toHaveLength(1);
    expect(revoked[0].id).toBe("msg-1");
    expect(revoked[0].chatId).toBe("thread-1");
    expect(revoked[0].from).toBe("sender-1");
    expect(revoked[0].to).toBe("thread-1");
    expect(revoked[0].timestamp).toBe(1690000000000);
  });

  it("emits message:revoked for unsend event with alternative timestamp field", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const revoked: any[] = [];
    engine.on("message:revoked", (ev) => revoked.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "unsend",
      messageID: "msg-2",
      threadID: "thread-2",
      senderID: "sender-2",
      timestamp: "1690000000001",
    });

    expect(revoked).toHaveLength(1);
    expect(revoked[0].id).toBe("msg-2");
    expect(revoked[0].timestamp).toBe(1690000000001);
  });

  it("ignores log: events", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "event",
      threadID: "thread-1",
      messageID: "ev-1",
      logMessageType: "log:thread-name",
      logMessageData: { name: "New Name" },
      logMessageBody: "changed name",
      timestamp: "1690000000000",
      author: "sender-1",
    });

    expect(messages).toHaveLength(0);
  });

  it("does not emit message:reaction for Messenger", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const reactions: any[] = [];
    engine.on("message:reaction", (ev) => reactions.push(ev));

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message_reaction",
      threadID: "thread-1",
      messageID: "msg-1",
      reaction: "❤️",
      senderID: "sender-1",
      userID: "sender-1",
    });

    expect(reactions).toHaveLength(0);
  });

  it("double-listen guard prevents multiple listenMqtt calls", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    expect(mockApi.listenMqtt).toHaveBeenCalledTimes(1);

    // Connect again on already-connected session
    await engine.connect("bot-1");
    expect(mockApi.listenMqtt).toHaveBeenCalledTimes(1);
  });

  it("disconnect stops listening and ignores late events", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const messages: any[] = [];
    engine.on("message", (ev) => messages.push(ev));

    await engine.disconnect("bot-1");

    const callback = mockApi.listenMqtt.mock.calls[0][0];
    callback(null, {
      type: "message",
      senderID: "sender-1",
      body: "late",
      threadID: "thread-1",
      messageID: "msg-late",
      attachments: [],
      mentions: {},
      timestamp: "1690000000000",
      isGroup: false,
    });

    expect(messages).toHaveLength(0);
    expect(engine.getStatus("bot-1")).toBe("disconnected");
  });

  it("handles listenMqtt callback errors gracefully", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const callback = mockApi.listenMqtt.mock.calls[0][0];

    // Should not throw
    callback({ type: "stop_listen", error: "Connection lost" }, null);

    // Engine should still be functional
    expect(engine.getStatus("bot-1")).toBe("connected");
  });

  it("handles handler exceptions gracefully without crashing", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const callback = mockApi.listenMqtt.mock.calls[0][0];

    // Should not throw even with bad event shapes
    callback(null, null);
    callback(null, undefined);
    callback(null, "not an object");

    expect(engine.getStatus("bot-1")).toBe("connected");
  });
});

/* ─── Anti-ban isolation ─── */

describe("MessengerEngine anti-ban isolation", () => {
  it("sendText completes without artificial typing delay", async () => {
    const engine = new MessengerEngine({ appState: "[]" });
    const adapter = createMockAdapter();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    const start = Date.now();
    mockApi.sendMessage.mockResolvedValue({ messageID: "fast-1" });
    await engine.sendText(
      "bot-1",
      "thread-1",
      "a very long message that would normally trigger typing simulation on WhatsAppEngine",
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});
