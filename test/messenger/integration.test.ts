import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEngine } from "../../src/factory.js";
import { SQLiteAdapter } from "../../src/adapters/sqlite.js";

let mockApi: ReturnType<typeof createMockApi>;
let mqttCallback: ((err: any, event: any) => void) | null = null;

function createMockApi() {
  return {
    getCurrentUserID: vi.fn(() => "user-123"),
    listenMqtt: vi.fn((cb: any) => {
      mqttCallback = cb;
    }),
    sendMessage: vi.fn(async (_message: any, _threadID: string) => ({
      messageID: "msg-1",
      threadID: _threadID,
    })),
    sendTypingIndicator: vi.fn(async () => {}),
    stopListening: vi.fn(),
  };
}

vi.mock("../../src/messenger/client-loader.js", () => ({
  loadMessengerClient: vi.fn(async () => ({
    login: vi.fn(async () => mockApi),
  })),
}));

beforeEach(() => {
  mockApi = createMockApi();
  mqttCallback = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("MessengerEngine full pipeline", () => {
  it("factory -> adapter -> connect -> send -> inbound -> disconnect -> stop", async () => {
    const engine = createEngine("messenger", { appState: "[]" });
    const adapter = new SQLiteAdapter({ filePath: ":memory:" });
    await adapter.initialize();
    engine.registerAdapter(adapter);

    const conn: any[] = [];
    const messages: any[] = [];
    const acks: any[] = [];
    const creates: any[] = [];
    const revoked: any[] = [];
    const reactions: any[] = [];
    const errors: any[] = [];

    engine.on("connection", (ev) => conn.push(ev));
    engine.on("message", (ev) => messages.push(ev));
    engine.on("message:ack", (id, status) => acks.push({ id, status }));
    engine.on("message:create", (ev) => creates.push(ev));
    engine.on("message:revoked", (ev) => revoked.push(ev));
    engine.on("message:reaction", (ev) => reactions.push(ev));
    engine.on("error", (ev) => errors.push(ev));

    // Connect
    await engine.connect("bot-1");
    expect(engine.getStatus("bot-1")).toBe("connected");
    expect(conn.map((e) => e.status)).toEqual([
      "initializing",
      "connecting",
      "connected",
    ]);
    expect(engine.listSessions()).toEqual(["bot-1"]);

    // Adapter persisted platform=messenger
    const session = await adapter.getSession("bot-1");
    expect(session?.platform).toBe("messenger");

    // Send text + synthetic ack
    const result = await engine.sendText("bot-1", "thread-1", "hello");
    expect(result.id).toBe("msg-1");
    expect(acks).toEqual([{ id: "msg-1", status: "delivered" }]);
    expect(creates).toHaveLength(1);
    expect(creates[0].message.body).toBe("hello");
    expect(creates[0].message.fromMe).toBe(true);

    // Inbound message
    expect(mqttCallback).not.toBeNull();
    mqttCallback!(null, {
      type: "message",
      senderID: "sender-1",
      body: "hi back",
      threadID: "thread-1",
      messageID: "msg-in",
      attachments: [],
      mentions: {},
      timestamp: "1690000000000",
      isGroup: false,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].message.id).toBe("msg-in");
    expect(messages[0].message.body).toBe("hi back");
    expect(messages[0].message.fromMe).toBe(false);

    // Unsend -> revoked
    mqttCallback!(null, {
      type: "unsend",
      messageID: "msg-in",
      threadID: "thread-1",
      senderID: "sender-1",
      deletionTimestamp: "1690000000001",
    });
    expect(revoked).toHaveLength(1);
    expect(revoked[0].id).toBe("msg-in");

    // Reactions ignored
    mqttCallback!(null, {
      type: "message_reaction",
      messageID: "r1",
      threadID: "thread-1",
      senderID: "s1",
      reaction: "❤️",
    });
    expect(reactions).toHaveLength(0);

    // Disconnect
    await engine.disconnect("bot-1");
    expect(engine.getStatus("bot-1")).toBe("disconnected");
    expect(conn.map((e) => e.status)).toContain("disconnected");

    // Stop
    await engine.stop();
    expect(engine.listSessions()).toEqual([]);

    // No errors in the happy path
    expect(errors).toHaveLength(0);
  });

  it("sendChatState typing works and recording throws", async () => {
    const engine = createEngine("messenger", { appState: "[]" });
    const adapter = new SQLiteAdapter({ filePath: ":memory:" });
    await adapter.initialize();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    await engine.sendChatState("bot-1", "thread-1", "typing");
    expect(mockApi.sendTypingIndicator).toHaveBeenCalledWith(
      true,
      "thread-1",
    );

    await expect(
      engine.sendChatState("bot-1", "thread-1", "recording"),
    ).rejects.toThrow("Chat state 'recording' is not supported on Messenger");

    await engine.stop();
  });

  it("sendMedia respects size cap", async () => {
    const engine = createEngine("messenger", {
      appState: "[]",
      mediaMaxSize: 1024,
    });
    const adapter = new SQLiteAdapter({ filePath: ":memory:" });
    await adapter.initialize();
    engine.registerAdapter(adapter);
    await engine.connect("bot-1");

    await expect(
      engine.sendMedia("bot-1", "thread-1", {
        mimetype: "image/png",
        data: Buffer.alloc(2048),
      }),
    ).rejects.toThrow("Media exceeds size cap");

    await engine.stop();
  });
});
