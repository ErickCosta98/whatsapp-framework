import { Pool, type PoolConfig } from "pg";
import type {
  ChatRecord,
  ContactRecord,
  IDatabaseAdapter,
  SessionRecord,
  StoredMessage,
} from "../types/adapter.js";

export type PostgresAdapterConfig = PoolConfig;

/**
 * PostgreSQL adapter using the `pg` library.
 *
 * Uses a connection pool for all queries. Fully async-native.
 */
export class PostgresAdapter implements IDatabaseAdapter {
  private pool: Pool;

  constructor(config: PostgresAdapterConfig) {
    this.pool = new Pool(config);
  }

  /**
   * Create all required tables if they do not already exist.
   * Idempotent — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS sessions (
        name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        phone TEXT,
        push_name TEXT,
        created_at BIGINT,
        updated_at BIGINT
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        session_name TEXT NOT NULL,
        key_id TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp BIGINT,
        PRIMARY KEY (session_name, key_id)
      )`,
      `CREATE TABLE IF NOT EXISTS lid_mappings (
        lid TEXT PRIMARY KEY,
        pn TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT,
        push_name TEXT,
        number TEXT,
        is_my_contact BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE
      )`,
      `CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone_jid TEXT,
        unread_count INT DEFAULT 0,
        last_message_timestamp BIGINT
      )`,
    ];
    for (const sql of ddl) {
      await this.pool.query(sql);
    }
  }

  /* ─── Session store ─── */

  async getSession(name: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `SELECT name, status, phone, push_name AS "pushName",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM sessions WHERE name = $1`,
      [name],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      name: r.name,
      status: r.status,
      phone: r.phone ?? null,
      pushName: r.pushName ?? null,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }

  async upsertSession(record: SessionRecord): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `INSERT INTO sessions (name, status, phone, push_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         status = EXCLUDED.status,
         phone = EXCLUDED.phone,
         push_name = EXCLUDED.push_name,
         updated_at = EXCLUDED.updated_at`,
      [
        record.name,
        record.status,
        record.phone ?? null,
        record.pushName ?? null,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      ],
    );
  }

  async deleteSession(name: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE name = $1`, [name]);
  }

  /* ─── Message store ─── */

  async getMessage(
    sessionName: string,
    messageId: string,
  ): Promise<StoredMessage | null> {
    const result = await this.pool.query(
      `SELECT key_id AS "keyId", message, timestamp
       FROM messages WHERE session_name = $1 AND key_id = $2`,
      [sessionName, messageId],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      keyId: r.keyId,
      message: JSON.parse(r.message),
      timestamp: r.timestamp ?? undefined,
    };
  }

  async putMessage(sessionName: string, msg: StoredMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO messages (session_name, key_id, message, timestamp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_name, key_id) DO UPDATE SET
         message = EXCLUDED.message,
         timestamp = EXCLUDED.timestamp`,
      [sessionName, msg.keyId, JSON.stringify(msg.message), msg.timestamp ?? null],
    );
  }

  async clearSessionMessages(sessionName: string): Promise<void> {
    await this.pool.query(`DELETE FROM messages WHERE session_name = $1`, [sessionName]);
  }

  /* ─── LID mappings ─── */

  async getLidMapping(lid: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT pn FROM lid_mappings WHERE lid = $1`,
      [lid],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].pn ?? null;
  }

  async upsertLidMapping(lid: string, pn: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO lid_mappings (lid, pn) VALUES ($1, $2)
       ON CONFLICT (lid) DO UPDATE SET pn = EXCLUDED.pn`,
      [lid, pn],
    );
  }

  /* ─── Contacts ─── */

  async listContacts(): Promise<ContactRecord[]> {
    const result = await this.pool.query(
      `SELECT id, name, push_name AS "pushName", number,
              is_my_contact AS "isMyContact", is_blocked AS "isBlocked"
       FROM contacts`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      pushName: r.pushName ?? null,
      number: r.number ?? null,
      isMyContact: Boolean(r.isMyContact),
      isBlocked: Boolean(r.isBlocked),
    }));
  }

  async upsertContact(contact: ContactRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO contacts (id, name, push_name, number, is_my_contact, is_blocked)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         push_name = EXCLUDED.push_name,
         number = EXCLUDED.number,
         is_my_contact = EXCLUDED.is_my_contact,
         is_blocked = EXCLUDED.is_blocked`,
      [
        contact.id,
        contact.name ?? null,
        contact.pushName ?? null,
        contact.number ?? null,
        contact.isMyContact ?? false,
        contact.isBlocked ?? false,
      ],
    );
  }

  /* ─── Chats ─── */

  async listChats(): Promise<ChatRecord[]> {
    const result = await this.pool.query(
      `SELECT id, name, phone_jid AS "phoneJid", unread_count AS "unreadCount",
              last_message_timestamp AS "lastMessageTimestamp"
       FROM chats`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      phoneJid: r.phoneJid ?? null,
      unreadCount: r.unreadCount ?? 0,
      lastMessageTimestamp: r.lastMessageTimestamp ?? undefined,
    }));
  }

  async upsertChat(chat: ChatRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO chats (id, name, phone_jid, unread_count, last_message_timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone_jid = EXCLUDED.phone_jid,
         unread_count = EXCLUDED.unread_count,
         last_message_timestamp = EXCLUDED.last_message_timestamp`,
      [
        chat.id,
        chat.name ?? null,
        chat.phoneJid ?? null,
        chat.unreadCount ?? 0,
        chat.lastMessageTimestamp ?? null,
      ],
    );
  }
}
