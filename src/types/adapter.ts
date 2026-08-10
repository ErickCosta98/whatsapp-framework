/**
 * Database adapter interface for session persistence, message storage,
 * LID mappings, and contact/chat metadata.
 *
 * All methods are async to provide a uniform interface across sync
 * (better-sqlite3) and async (mysql2, pg) drivers.
 */

export interface SessionRecord {
  name: string;
  status: string;
  phone?: string | null;
  pushName?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface StoredMessage {
  keyId: string;
  message: unknown;
  timestamp?: number;
}

export interface ContactRecord {
  id: string;
  name?: string | null;
  pushName?: string | null;
  number?: string | null;
  isMyContact?: boolean;
  isBlocked?: boolean;
}

export interface ChatRecord {
  id: string;
  name?: string | null;
  phoneJid?: string | null;
  unreadCount?: number;
  lastMessageTimestamp?: number;
}

export interface IDatabaseAdapter {
  /** Session store */
  getSession(name: string): Promise<SessionRecord | null>;
  upsertSession(record: SessionRecord): Promise<void>;
  deleteSession(name: string): Promise<void>;

  /** Message store for retry protocol */
  getMessage(sessionName: string, messageId: string): Promise<StoredMessage | null>;
  putMessage(sessionName: string, msg: StoredMessage): Promise<void>;
  clearSessionMessages(sessionName: string): Promise<void>;

  /** LID mappings */
  getLidMapping(lid: string): Promise<string | null>;
  upsertLidMapping(lid: string, pn: string): Promise<void>;

  /** Contacts */
  listContacts(): Promise<ContactRecord[]>;
  upsertContact(contact: ContactRecord): Promise<void>;

  /** Chats */
  listChats(): Promise<ChatRecord[]>;
  upsertChat(chat: ChatRecord): Promise<void>;
}
