import { describe, it, expect } from "vitest";
import { SQLiteAdapter } from "../../src/adapters/sqlite.js";
import type { SessionRecord, StoredMessage, ContactRecord, ChatRecord } from "../../src/types/adapter.js";

describe("adapters / sqlite", () => {
  async function createAdapter(): Promise<SQLiteAdapter> {
    const adapter = new SQLiteAdapter({ filePath: ":memory:" });
    await adapter.initialize();
    return adapter;
  }

  describe("initialize", () => {
    it("creates tables idempotently", async () => {
      const adapter = await createAdapter();
      // second call should not throw
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it("adds platform and app_state columns idempotently", async () => {
      const adapter = await createAdapter();
      await adapter.initialize(); // second call
      await adapter.upsertSession({
        name: "bot-1",
        status: "connected",
        platform: "messenger",
        appState: "enc",
      });
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual(
        expect.objectContaining({ platform: "messenger", appState: "enc" }),
      );
    });
  });

  describe("session CRUD", () => {
    it("returns null for missing session", async () => {
      const adapter = await createAdapter();
      const result = await adapter.getSession("nonexistent");
      expect(result).toBeNull();
    });

    it("creates and retrieves a session", async () => {
      const adapter = await createAdapter();
      const record: SessionRecord = {
        name: "bot-1",
        status: "connected",
        phone: "+1234567890",
        pushName: "Bot One",
      };
      await adapter.upsertSession(record);
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual(expect.objectContaining(record));
    });

    it("updates an existing session", async () => {
      const adapter = await createAdapter();
      await adapter.upsertSession({ name: "bot-1", status: "connecting" });
      await adapter.upsertSession({ name: "bot-1", status: "connected", phone: "+111" });
      const result = await adapter.getSession("bot-1");
      expect(result?.status).toBe("connected");
      expect(result?.phone).toBe("+111");
    });

    it("deletes a session", async () => {
      const adapter = await createAdapter();
      await adapter.upsertSession({ name: "bot-1", status: "connected" });
      await adapter.deleteSession("bot-1");
      expect(await adapter.getSession("bot-1")).toBeNull();
    });

    it("round-trips platform and appState", async () => {
      const adapter = await createAdapter();
      const record: SessionRecord = {
        name: "bot-m",
        status: "connected",
        platform: "messenger",
        appState: "encrypted",
      };
      await adapter.upsertSession(record);
      const result = await adapter.getSession("bot-m");
      expect(result).toEqual(expect.objectContaining(record));
    });

    it("defaults platform to whatsapp when absent", async () => {
      const adapter = await createAdapter();
      await adapter.upsertSession({ name: "bot-w", status: "connected" });
      const result = await adapter.getSession("bot-w");
      expect(result?.platform).toBe("whatsapp");
      expect(result?.appState).toBeNull();
    });
  });

  describe("message CRUD", () => {
    it("stores and retrieves a message", async () => {
      const adapter = await createAdapter();
      const msg: StoredMessage = {
        keyId: "msg-1",
        message: { text: "hello" },
        timestamp: 12345,
      };
      await adapter.putMessage("bot-1", msg);
      const result = await adapter.getMessage("bot-1", "msg-1");
      expect(result).toEqual(msg);
    });

    it("returns null for missing message", async () => {
      const adapter = await createAdapter();
      expect(await adapter.getMessage("bot-1", "missing")).toBeNull();
    });

    it("updates an existing message", async () => {
      const adapter = await createAdapter();
      await adapter.putMessage("bot-1", { keyId: "msg-1", message: { text: "old" } });
      await adapter.putMessage("bot-1", { keyId: "msg-1", message: { text: "new" } });
      const result = await adapter.getMessage("bot-1", "msg-1");
      expect(result?.message).toEqual({ text: "new" });
    });

    it("clears session messages", async () => {
      const adapter = await createAdapter();
      await adapter.putMessage("bot-1", { keyId: "a", message: {} });
      await adapter.putMessage("bot-1", { keyId: "b", message: {} });
      await adapter.clearSessionMessages("bot-1");
      expect(await adapter.getMessage("bot-1", "a")).toBeNull();
      expect(await adapter.getMessage("bot-1", "b")).toBeNull();
    });

    it("isolates messages by session", async () => {
      const adapter = await createAdapter();
      await adapter.putMessage("bot-1", { keyId: "msg-1", message: { from: "bot-1" } });
      await adapter.putMessage("bot-2", { keyId: "msg-1", message: { from: "bot-2" } });
      const r1 = await adapter.getMessage("bot-1", "msg-1");
      const r2 = await adapter.getMessage("bot-2", "msg-1");
      expect(r1?.message).toEqual({ from: "bot-1" });
      expect(r2?.message).toEqual({ from: "bot-2" });
    });
  });

  describe("LID mappings", () => {
    it("stores and retrieves a LID mapping", async () => {
      const adapter = await createAdapter();
      await adapter.upsertLidMapping("lid-123", "+1234567890");
      const result = await adapter.getLidMapping("lid-123");
      expect(result).toBe("+1234567890");
    });

    it("returns null for unknown LID", async () => {
      const adapter = await createAdapter();
      expect(await adapter.getLidMapping("unknown")).toBeNull();
    });

    it("updates an existing mapping", async () => {
      const adapter = await createAdapter();
      await adapter.upsertLidMapping("lid-123", "+111");
      await adapter.upsertLidMapping("lid-123", "+222");
      expect(await adapter.getLidMapping("lid-123")).toBe("+222");
    });
  });

  describe("contacts", () => {
    it("stores and lists contacts", async () => {
      const adapter = await createAdapter();
      const contact: ContactRecord = {
        id: "123@c.us",
        name: "Alice",
        pushName: "Ali",
        number: "+123",
        isMyContact: true,
        isBlocked: false,
      };
      await adapter.upsertContact(contact);
      const contacts = await adapter.listContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toEqual(expect.objectContaining(contact));
    });

    it("updates an existing contact", async () => {
      const adapter = await createAdapter();
      await adapter.upsertContact({ id: "123@c.us", name: "Alice" });
      await adapter.upsertContact({ id: "123@c.us", name: "Alice Smith" });
      const contacts = await adapter.listContacts();
      expect(contacts[0].name).toBe("Alice Smith");
    });

    it("returns empty list when no contacts", async () => {
      const adapter = await createAdapter();
      const contacts = await adapter.listContacts();
      expect(contacts).toEqual([]);
    });
  });

  describe("chats", () => {
    it("stores and lists chats", async () => {
      const adapter = await createAdapter();
      const chat: ChatRecord = {
        id: "123@c.us",
        name: "Alice",
        phoneJid: "123@s.whatsapp.net",
        unreadCount: 3,
        lastMessageTimestamp: 999,
      };
      await adapter.upsertChat(chat);
      const chats = await adapter.listChats();
      expect(chats).toHaveLength(1);
      expect(chats[0]).toEqual(expect.objectContaining(chat));
    });

    it("updates an existing chat", async () => {
      const adapter = await createAdapter();
      await adapter.upsertChat({ id: "123@c.us", name: "Alice", unreadCount: 1 });
      await adapter.upsertChat({ id: "123@c.us", name: "Alice Smith", unreadCount: 5 });
      const chats = await adapter.listChats();
      expect(chats[0].name).toBe("Alice Smith");
      expect(chats[0].unreadCount).toBe(5);
    });

    it("returns empty list when no chats", async () => {
      const adapter = await createAdapter();
      const chats = await adapter.listChats();
      expect(chats).toEqual([]);
    });
  });
});
