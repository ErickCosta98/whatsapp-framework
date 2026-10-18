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
        session_name VARCHAR(255) NOT NULL DEFAULT '',
        id VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        push_name VARCHAR(255),
        number VARCHAR(50),
        is_my_contact BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (session_name, id)
      )`,
      `CREATE TABLE IF NOT EXISTS chats (
        session_name VARCHAR(255) NOT NULL DEFAULT '',
        id VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        phone_jid VARCHAR(255),
        unread_count INT DEFAULT 0,
        last_message_timestamp BIGINT,
        PRIMARY KEY (session_name, id)
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

  async listLidMappings(): Promise<Array<{ lid: string; pn: string }>> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT lid, pn FROM lid_mappings`,
    );
    return rows.map((r) => ({ lid: r.lid, pn: r.pn }));
  }

  /* ─── Contacts ─── */

  async listContacts(sessionName?: string): Promise<ContactRecord[]> {
    let sql = `SELECT session_name AS sessionName, id, name, push_name AS pushName, number,
                      is_my_contact AS isMyContact, is_blocked AS isBlocked
               FROM contacts`;
    const params: any[] = [];
    if (sessionName !== undefined) {
      sql += ` WHERE session_name = ?`;
      params.push(sessionName);
    }
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      sessionName: r.sessionName || undefined,
      name: r.name ?? null,
      pushName: r.pushName ?? null,
      number: r.number ?? null,
      isMyContact: Boolean(r.isMyContact),
      isBlocked: Boolean(r.isBlocked),
    }));
  }

  async upsertContact(contact: ContactRecord): Promise<void> {
    const sessionName = contact.sessionName ?? "";
    await this.pool.execute(
      `INSERT INTO contacts (session_name, id, name, push_name, number, is_my_contact, is_blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         push_name = VALUES(push_name),
         number = VALUES(number),
         is_my_contact = VALUES(is_my_contact),
         is_blocked = VALUES(is_blocked)`,
      [
        sessionName,
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

  async listChats(sessionName?: string): Promise<ChatRecord[]> {
    let sql = `SELECT session_name AS sessionName, id, name, phone_jid AS phoneJid,
                      unread_count AS unreadCount, last_message_timestamp AS lastMessageTimestamp
               FROM chats`;
    const params: any[] = [];
    if (sessionName !== undefined) {
      sql += ` WHERE session_name = ?`;
      params.push(sessionName);
    }
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      sessionName: r.sessionName || undefined,
      name: r.name ?? null,
      phoneJid: r.phoneJid ?? null,
      unreadCount: r.unreadCount ?? 0,
      lastMessageTimestamp: r.lastMessageTimestamp ?? undefined,
    }));
  }

  async upsertChat(chat: ChatRecord): Promise<void> {
    const sessionName = chat.sessionName ?? "";
    await this.pool.execute(
      `INSERT INTO chats (session_name, id, name, phone_jid, unread_count, last_message_timestamp)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         phone_jid = VALUES(phone_jid),
         unread_count = VALUES(unread_count),
         last_message_timestamp = VALUES(last_message_timestamp)`,
      [
        sessionName,
        chat.id,
        chat.name ?? null,
        chat.phoneJid ?? null,
        chat.unreadCount ?? 0,
        chat.lastMessageTimestamp ?? null,
      ],
    );
  }
}
