import type { ChatRecord, ContactRecord, IDatabaseAdapter, SessionRecord, StoredMessage } from "../types/adapter.js";
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
export declare class SQLiteAdapter implements IDatabaseAdapter {
    private db;
    constructor(config: SQLiteAdapterConfig);
    /**
     * Create all required tables if they do not already exist.
     * Idempotent — safe to call multiple times.
     */
    initialize(): Promise<void>;
    getSession(name: string): Promise<SessionRecord | null>;
    upsertSession(record: SessionRecord): Promise<void>;
    deleteSession(name: string): Promise<void>;
    getMessage(sessionName: string, messageId: string): Promise<StoredMessage | null>;
    putMessage(sessionName: string, msg: StoredMessage): Promise<void>;
    clearSessionMessages(sessionName: string): Promise<void>;
    getLidMapping(lid: string): Promise<string | null>;
    upsertLidMapping(lid: string, pn: string): Promise<void>;
    listContacts(): Promise<ContactRecord[]>;
    upsertContact(contact: ContactRecord): Promise<void>;
    listChats(): Promise<ChatRecord[]>;
    upsertChat(chat: ChatRecord): Promise<void>;
}
//# sourceMappingURL=sqlite.d.ts.map