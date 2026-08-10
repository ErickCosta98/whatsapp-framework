import { describe, it, expect, vi, type Mock } from "vitest";

/*
  Mock pg BEFORE importing the adapter.
  Vitest hoists vi.mock to the top of the file.
*/
vi.mock("pg", () => ({
  Pool: vi.fn(),
}));

import { Pool } from "pg";
import { PostgresAdapter } from "../../src/adapters/postgres.js";
import type { SessionRecord, StoredMessage, ContactRecord, ChatRecord } from "../../src/types/adapter.js";

describe("adapters / postgres (mocked)", () => {
  let mockQuery: Mock;
  let adapter: PostgresAdapter;

  beforeEach(() => {
    mockQuery = vi.fn();

    (Pool as unknown as Mock).mockImplementation(() => ({
      query: mockQuery,
    }));

    adapter = new PostgresAdapter({ connectionString: "postgres://test" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialize", () => {
    it("creates all five tables", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await adapter.initialize();
      expect(mockQuery).toHaveBeenCalledTimes(5);
      const calls = mockQuery.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS sessions"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS messages"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS lid_mappings"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS contacts"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS chats"))).toBe(true);
    });
  });

  describe("session CRUD", () => {
    it("getSession returns null when not found", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await adapter.getSession("bot-1");
      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM sessions WHERE name = $1"),
        ["bot-1"],
      );
    });

    it("getSession returns record when found", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            name: "bot-1",
            status: "connected",
            phone: "+123",
            pushName: "Bot",
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
      });
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual({
        name: "bot-1",
        status: "connected",
        phone: "+123",
        pushName: "Bot",
        createdAt: 1000,
        updatedAt: 2000,
      });
    });

    it("upsertSession uses INSERT ... ON CONFLICT DO UPDATE", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const record: SessionRecord = { name: "bot-1", status: "connected" };
      await adapter.upsertSession(record);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO sessions/);
      expect(sql).toMatch(/ON CONFLICT \(name\) DO UPDATE/);
    });

    it("deleteSession executes DELETE with name param", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await adapter.deleteSession("bot-1");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sessions WHERE name = $1"),
        ["bot-1"],
      );
    });
  });

  describe("message CRUD", () => {
    it("getMessage returns parsed JSON", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ keyId: "msg-1", message: JSON.stringify({ text: "hi" }), timestamp: 123 }],
      });
      const result = await adapter.getMessage("bot-1", "msg-1");
      expect(result).toEqual({ keyId: "msg-1", message: { text: "hi" }, timestamp: 123 });
    });

    it("putMessage stringifies message to JSON", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const msg: StoredMessage = { keyId: "msg-1", message: { text: "hi" } };
      await adapter.putMessage("bot-1", msg);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe(JSON.stringify({ text: "hi" }));
    });

    it("clearSessionMessages executes DELETE with session param", async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });
      await adapter.clearSessionMessages("bot-1");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM messages WHERE session_name = $1"),
        ["bot-1"],
      );
    });
  });

  describe("LID mappings", () => {
    it("getLidMapping returns phone for known LID", async () => {
      mockQuery.mockResolvedValue({ rows: [{ pn: "+123" }] });
      const result = await adapter.getLidMapping("lid-1");
      expect(result).toBe("+123");
    });

    it("upsertLidMapping uses ON CONFLICT DO UPDATE", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await adapter.upsertLidMapping("lid-1", "+123");
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO lid_mappings/);
      expect(sql).toMatch(/ON CONFLICT \(lid\) DO UPDATE/);
    });
  });

  describe("contacts", () => {
    it("listContacts maps boolean columns", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "1", name: "A", pushName: null, number: null, isMyContact: true, isBlocked: false },
        ],
      });
      const contacts = await adapter.listContacts();
      expect(contacts[0].isMyContact).toBe(true);
      expect(contacts[0].isBlocked).toBe(false);
    });

    it("upsertContact uses correct SQL", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const contact: ContactRecord = { id: "1", name: "A", isMyContact: true, isBlocked: false };
      await adapter.upsertContact(contact);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO contacts/);
      expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    });
  });

  describe("chats", () => {
    it("listChats maps columns", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "1", name: "Chat", phoneJid: "jid", unreadCount: 2, lastMessageTimestamp: 100 },
        ],
      });
      const chats = await adapter.listChats();
      expect(chats[0]).toEqual({
        id: "1",
        name: "Chat",
        phoneJid: "jid",
        unreadCount: 2,
        lastMessageTimestamp: 100,
      });
    });

    it("upsertChat uses correct SQL", async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const chat: ChatRecord = { id: "1", name: "Chat" };
      await adapter.upsertChat(chat);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO chats/);
      expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    });
  });

  describe("edge cases", () => {
    it("handles null values gracefully", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ name: "bot-1", status: "connected", phone: null, pushName: null, createdAt: null, updatedAt: null }],
      });
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual({
        name: "bot-1",
        status: "connected",
        phone: null,
        pushName: null,
        createdAt: undefined,
        updatedAt: undefined,
      });
    });

    it("listContacts returns empty array when no rows", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const contacts = await adapter.listContacts();
      expect(contacts).toEqual([]);
    });
  });
});
