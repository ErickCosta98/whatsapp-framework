import mysql from "mysql2/promise";
import type {
  ChatRecord,
  ContactRecord,
  IDatabaseAdapter,
  SessionRecord,
  StoredMessage,
} from "../types/adapter.js";

export type MySQLAdapterConfig = mysql.PoolOptions;

/**
 * MySQL adapter using mysql2/promise.
 *
 * Uses a connection pool for all queries. Fully async-native.
 */
export class MySQLAdapter implements IDatabaseAdapter {
  private pool: mysql.Pool;

  constructor(config: MySQLAdapterConfig) {
    this.pool = mysql.createPool(config);
  }

  /**
   * Create all required tables if they do not already exist.
   * Idempotent — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS sessions (
        name VARCHAR(255) PRIMARY KEY,
        status VARCHAR(50) NOT NULL,
        phone VARCHAR(50),
        push_name VARCHAR(255),
        created_at BIGINT,
        updated_at BIGINT
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        session_name VARCHAR(255) NOT NULL,
        key_id VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        timestamp BIGINT,
        PRIMARY KEY (session_name, key_id)
      )`,
      `CREATE TABLE IF NOT EXISTS lid_mappings (
        lid VARCHAR(255) PRIMARY KEY,
        pn VARCHAR(50) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS contacts (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        push_name VARCHAR(255),
        number VARCHAR(50),
        is_my_contact BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE
      )`,
      `CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        phone_jid VARCHAR(255),
        unread_count INT DEFAULT 0,
        last_message_timestamp BIGINT
      )`,
    ];
    for (const sql of ddl) {
      await this.pool.execute(sql);
    }
  }

  /* ─── Session store ─── */

  async getSession(name: string): Promise<SessionRecord | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT name, status, phone, push_name AS pushName,
              created_at AS createdAt, updated_at AS updatedAt
       FROM sessions WHERE name = ?`,
      [name],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
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
    await this.pool.execute(
      `INSERT INTO sessions (name, status, phone, push_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         phone = VALUES(phone),
         push_name = VALUES(push_name),
         updated_at = VALUES(updated_at)`,
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
    await this.pool.execute(`DELETE FROM sessions WHERE name = ?`, [name]);
  }

  /* ─── Message store ─── */

  async getMessage(
    sessionName: string,
    messageId: string,
  ): Promise<StoredMessage | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT key_id AS keyId, message, timestamp
       FROM messages WHERE session_name = ? AND key_id = ?`,
      [sessionName, messageId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      keyId: r.keyId,
      message: JSON.parse(r.message),
      timestamp: r.timestamp ?? undefined,
    };
  }

  async putMessage(sessionName: string, msg: StoredMessage): Promise<void> {
    await this.pool.execute(
      `INSERT INTO messages (session_name, key_id, message, timestamp)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         message = VALUES(message),
         timestamp = VALUES(timestamp)`,
      [sessionName, msg.keyId, JSON.stringify(msg.message), msg.timestamp ?? null],
    );
  }

  async clearSessionMessages(sessionName: string): Promise<void> {
    await this.pool.execute(`DELETE FROM messages WHERE session_name = ?`, [sessionName]);
  }

  /* ─── LID mappings ─── */

  async getLidMapping(lid: string): Promise<string | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT pn FROM lid_mappings WHERE lid = ?`,
      [lid],
    );
    if (rows.length === 0) return null;
    return rows[0].pn ?? null;
  }

  async upsertLidMapping(lid: string, pn: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO lid_mappings (lid, pn) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE pn = VALUES(pn)`,
      [lid, pn],
    );
  }

  /* ─── Contacts ─── */

  async listContacts(): Promise<ContactRecord[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, push_name AS pushName, number,
              is_my_contact AS isMyContact, is_blocked AS isBlocked
       FROM contacts`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      pushName: r.pushName ?? null,
      number: r.number ?? null,
      isMyContact: Boolean(r.isMyContact),
      isBlocked: Boolean(r.isBlocked),
    }));
  }

  async upsertContact(contact: ContactRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO contacts (id, name, push_name, number, is_my_contact, is_blocked)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         push_name = VALUES(push_name),
         number = VALUES(number),
         is_my_contact = VALUES(is_my_contact),
         is_blocked = VALUES(is_blocked)`,
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
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, phone_jid AS phoneJid, unread_count AS unreadCount,
              last_message_timestamp AS lastMessageTimestamp
       FROM chats`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      phoneJid: r.phoneJid ?? null,
      unreadCount: r.unreadCount ?? 0,
      lastMessageTimestamp: r.lastMessageTimestamp ?? undefined,
    }));
  }

  async upsertChat(chat: ChatRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO chats (id, name, phone_jid, unread_count, last_message_timestamp)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         phone_jid = VALUES(phone_jid),
         unread_count = VALUES(unread_count),
         last_message_timestamp = VALUES(last_message_timestamp)`,
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
