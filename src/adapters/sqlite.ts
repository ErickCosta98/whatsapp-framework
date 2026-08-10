import Database from "better-sqlite3";
import type {
  ChatRecord,
  ContactRecord,
  IDatabaseAdapter,
  SessionRecord,
  StoredMessage,
} from "../types/adapter.js";

export interface SQLiteAdapterConfig {
  filePath: string;
}

/**
 * SQLite adapter using better-sqlite3.
 *
 * better-sqlite3 has a synchronous API. All public methods wrap the
 * synchronous calls in `Promise.resolve()` so the adapter still
 * implements the async `IDatabaseAdapter` interface uniformly.
 */
export class SQLiteAdapter implements IDatabaseAdapter {
  private db: Database.Database;

  constructor(config: SQLiteAdapterConfig) {
    this.db = new Database(config.filePath);
  }

  /**
   * Create all required tables if they do not already exist.
   * Idempotent — safe to call multiple times.
   */
  initialize(): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS sessions (
        name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        phone TEXT,
        push_name TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        session_name TEXT NOT NULL,
        key_id TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER,
        PRIMARY KEY (session_name, key_id)
      );

      CREATE TABLE IF NOT EXISTS lid_mappings (
        lid TEXT PRIMARY KEY,
        pn TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT,
        push_name TEXT,
        number TEXT,
        is_my_contact INTEGER DEFAULT 0,
        is_blocked INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone_jid TEXT,
        unread_count INTEGER DEFAULT 0,
        last_message_timestamp INTEGER
      );
    `;
    this.db.exec(ddl);
    return Promise.resolve();
  }

  /* ─── Session store ─── */

  getSession(name: string): Promise<SessionRecord | null> {
    const row = this.db
      .prepare(
        `SELECT name, status, phone, push_name AS pushName,
                created_at AS createdAt, updated_at AS updatedAt
         FROM sessions WHERE name = ?`,
      )
      .get(name) as
      | {
          name: string;
          status: string;
          phone: string | null;
          pushName: string | null;
          createdAt: number | null;
          updatedAt: number | null;
        }
      | undefined;
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      name: row.name,
      status: row.status,
      phone: row.phone,
      pushName: row.pushName,
      createdAt: row.createdAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    });
  }

  upsertSession(record: SessionRecord): Promise<void> {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO sessions (name, status, phone, push_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           status = excluded.status,
           phone = excluded.phone,
           push_name = excluded.push_name,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.name,
        record.status,
        record.phone ?? null,
        record.pushName ?? null,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      );
    return Promise.resolve();
  }

  deleteSession(name: string): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE name = ?`).run(name);
    return Promise.resolve();
  }

  /* ─── Message store ─── */

  getMessage(sessionName: string, messageId: string): Promise<StoredMessage | null> {
    const row = this.db
      .prepare(
        `SELECT key_id AS keyId, message, timestamp
         FROM messages WHERE session_name = ? AND key_id = ?`,
      )
      .get(sessionName, messageId) as
      | { keyId: string; message: string; timestamp: number | null }
      | undefined;
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      keyId: row.keyId,
      message: JSON.parse(row.message),
      timestamp: row.timestamp ?? undefined,
    });
  }

  putMessage(sessionName: string, msg: StoredMessage): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO messages (session_name, key_id, message, timestamp)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_name, key_id) DO UPDATE SET
           message = excluded.message,
           timestamp = excluded.timestamp`,
      )
      .run(
        sessionName,
        msg.keyId,
        JSON.stringify(msg.message),
        msg.timestamp ?? null,
      );
    return Promise.resolve();
  }

  clearSessionMessages(sessionName: string): Promise<void> {
    this.db.prepare(`DELETE FROM messages WHERE session_name = ?`).run(sessionName);
    return Promise.resolve();
  }

  /* ─── LID mappings ─── */

  getLidMapping(lid: string): Promise<string | null> {
    const row = this.db
      .prepare(`SELECT pn FROM lid_mappings WHERE lid = ?`)
      .get(lid) as { pn: string } | undefined;
    return Promise.resolve(row?.pn ?? null);
  }

  upsertLidMapping(lid: string, pn: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO lid_mappings (lid, pn) VALUES (?, ?)
         ON CONFLICT(lid) DO UPDATE SET pn = excluded.pn`,
      )
      .run(lid, pn);
    return Promise.resolve();
  }

  /* ─── Contacts ─── */

  listContacts(): Promise<ContactRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, push_name AS pushName, number,
                is_my_contact AS isMyContact, is_blocked AS isBlocked
         FROM contacts`,
      )
      .all() as Array<{
      id: string;
      name: string | null;
      pushName: string | null;
      number: string | null;
      isMyContact: number;
      isBlocked: number;
    }>;
    return Promise.resolve(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        pushName: r.pushName,
        number: r.number,
        isMyContact: Boolean(r.isMyContact),
        isBlocked: Boolean(r.isBlocked),
      })),
    );
  }

  upsertContact(contact: ContactRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO contacts (id, name, push_name, number, is_my_contact, is_blocked)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           push_name = excluded.push_name,
           number = excluded.number,
           is_my_contact = excluded.is_my_contact,
           is_blocked = excluded.is_blocked`,
      )
      .run(
        contact.id,
        contact.name ?? null,
        contact.pushName ?? null,
        contact.number ?? null,
        contact.isMyContact ? 1 : 0,
        contact.isBlocked ? 1 : 0,
      );
    return Promise.resolve();
  }

  /* ─── Chats ─── */

  listChats(): Promise<ChatRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, phone_jid AS phoneJid, unread_count AS unreadCount,
                last_message_timestamp AS lastMessageTimestamp
         FROM chats`,
      )
      .all() as Array<{
      id: string;
      name: string | null;
      phoneJid: string | null;
      unreadCount: number;
      lastMessageTimestamp: number | null;
    }>;
    return Promise.resolve(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        phoneJid: r.phoneJid,
        unreadCount: r.unreadCount,
        lastMessageTimestamp: r.lastMessageTimestamp ?? undefined,
      })),
    );
  }

  upsertChat(chat: ChatRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO chats (id, name, phone_jid, unread_count, last_message_timestamp)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           phone_jid = excluded.phone_jid,
           unread_count = excluded.unread_count,
           last_message_timestamp = excluded.last_message_timestamp`,
      )
      .run(
        chat.id,
        chat.name ?? null,
        chat.phoneJid ?? null,
        chat.unreadCount ?? 0,
        chat.lastMessageTimestamp ?? null,
      );
    return Promise.resolve();
  }
}
