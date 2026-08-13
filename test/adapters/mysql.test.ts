import { describe, it, expect, vi, type Mock } from "vitest";

/*
  Mock mysql2/promise BEFORE importing the adapter.
  Vitest hoists vi.mock to the top of the file.
*/
vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn() },
  createPool: vi.fn(),
}));

import mysql from "mysql2/promise";
import { MySQLAdapter } from "../../src/adapters/mysql.js";
import type { SessionRecord, StoredMessage, ContactRecord, ChatRecord } from "../../src/types/adapter.js";

describe("adapters / mysql (mocked)", () => {
  let mockExecute: Mock;
  let mockQuery: Mock;
  let adapter: MySQLAdapter;

  beforeEach(() => {
    mockExecute = vi.fn();
    mockQuery = vi.fn();

    (mysql.createPool as Mock).mockReturnValue({
      execute: mockExecute,
      query: mockQuery,
    });

    adapter = new MySQLAdapter({ host: "localhost", database: "test" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialize", () => {
    it("creates all five tables", async () => {
      mockExecute.mockResolvedValue([[], []]);
      await adapter.initialize();
      expect(mockExecute).toHaveBeenCalledTimes(7);
      const calls = mockExecute.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS sessions"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS messages"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS lid_mappings"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS contacts"))).toBe(true);
      expect(calls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS chats"))).toBe(true);
      expect(calls.some((sql) => sql.includes("ADD COLUMN platform"))).toBe(true);
      expect(calls.some((sql) => sql.includes("ADD COLUMN app_state"))).toBe(true);
    });

    it("ignores duplicate column errors on migration", async () => {
      mockExecute.mockImplementation(async (sql: string) => {
        if (sql.includes("ADD COLUMN")) {
          const err: any = new Error("Duplicate column name");
          err.code = "ER_DUP_FIELDNAME";
          throw err;
        }
        return [{ affectedRows: 0 }, []];
      });
      await expect(adapter.initialize()).resolves.not.toThrow();
    });
  });

  describe("session CRUD", () => {
    it("getSession returns null when not found", async () => {
      mockExecute.mockResolvedValue([[], []]);
      const result = await adapter.getSession("bot-1");
      expect(result).toBeNull();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("FROM sessions WHERE name = ?"),
        ["bot-1"],
      );
    });

    it("getSession returns record when found", async () => {
      mockExecute.mockResolvedValue([
        [
          {
            name: "bot-1",
            status: "connected",
            phone: "+123",
            pushName: "Bot",
            platform: "messenger",
            appState: "enc",
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
        [],
      ]);
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual({
        name: "bot-1",
        status: "connected",
        platform: "messenger",
        appState: "enc",
        phone: "+123",
        pushName: "Bot",
        createdAt: 1000,
        updatedAt: 2000,
      });
    });

    it("upsertSession uses INSERT ... ON DUPLICATE KEY UPDATE", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      const record: SessionRecord = {
        name: "bot-1",
        status: "connected",
        platform: "messenger",
        appState: "enc",
      };
      await adapter.upsertSession(record);
      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO sessions/);
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
      expect(sql).toMatch(/platform = VALUES\(platform\)/);
      expect(sql).toMatch(/app_state = VALUES\(app_state\)/);
      const params = mockExecute.mock.calls[0][1] as unknown[];
      expect(params[4]).toBe("messenger");
      expect(params[5]).toBe("enc");
    });

    it("deleteSession executes DELETE with name param", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      await adapter.deleteSession("bot-1");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sessions WHERE name = ?"),
        ["bot-1"],
      );
    });
  });

  describe("message CRUD", () => {
    it("getMessage returns parsed JSON", async () => {
      mockExecute.mockResolvedValue([
        [{ keyId: "msg-1", message: JSON.stringify({ text: "hi" }), timestamp: 123 }],
        [],
      ]);
      const result = await adapter.getMessage("bot-1", "msg-1");
      expect(result).toEqual({ keyId: "msg-1", message: { text: "hi" }, timestamp: 123 });
    });

    it("putMessage stringifies message to JSON", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      const msg: StoredMessage = { keyId: "msg-1", message: { text: "hi" } };
      await adapter.putMessage("bot-1", msg);
      const params = mockExecute.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe(JSON.stringify({ text: "hi" }));
    });

    it("clearSessionMessages executes DELETE with session param", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 2 }, []]);
      await adapter.clearSessionMessages("bot-1");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM messages WHERE session_name = ?"),
        ["bot-1"],
      );
    });
  });

  describe("LID mappings", () => {
    it("getLidMapping returns phone for known LID", async () => {
      mockExecute.mockResolvedValue([[{ pn: "+123" }], []]);
      const result = await adapter.getLidMapping("lid-1");
      expect(result).toBe("+123");
    });

    it("upsertLidMapping uses ON DUPLICATE KEY UPDATE", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      await adapter.upsertLidMapping("lid-1", "+123");
      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO lid_mappings/);
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    });
  });

  describe("contacts", () => {
    it("listContacts maps boolean columns", async () => {
      mockExecute.mockResolvedValue([
        [
          { id: "1", name: "A", pushName: null, number: null, isMyContact: 1, isBlocked: 0 },
        ],
        [],
      ]);
      const contacts = await adapter.listContacts();
      expect(contacts[0].isMyContact).toBe(true);
      expect(contacts[0].isBlocked).toBe(false);
    });

    it("upsertContact uses correct SQL", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      const contact: ContactRecord = { id: "1", name: "A", isMyContact: true, isBlocked: false };
      await adapter.upsertContact(contact);
      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO contacts/);
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    });
  });

  describe("chats", () => {
    it("listChats maps columns", async () => {
      mockExecute.mockResolvedValue([
        [
          { id: "1", name: "Chat", phoneJid: "jid", unreadCount: 2, lastMessageTimestamp: 100 },
        ],
        [],
      ]);
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
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
      const chat: ChatRecord = { id: "1", name: "Chat" };
      await adapter.upsertChat(chat);
      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO chats/);
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    });
  });

  describe("edge cases", () => {
    it("handles null values gracefully", async () => {
      mockExecute.mockResolvedValue([
        [{ name: "bot-1", status: "connected", phone: null, pushName: null, platform: null, appState: null, createdAt: null, updatedAt: null }],
        [],
      ]);
      const result = await adapter.getSession("bot-1");
      expect(result).toEqual({
        name: "bot-1",
        status: "connected",
        phone: null,
        pushName: null,
        platform: "whatsapp",
        appState: null,
        createdAt: undefined,
        updatedAt: undefined,
      });
    });

    it("listContacts returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue([[], []]);
      const contacts = await adapter.listContacts();
      expect(contacts).toEqual([]);
    });
  });
});
