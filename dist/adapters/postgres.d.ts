import { type PoolConfig } from "pg";
import type { ChatRecord, ContactRecord, IDatabaseAdapter, SessionRecord, StoredMessage } from "../types/adapter.js";
export type PostgresAdapterConfig = PoolConfig;
/**
 * PostgreSQL adapter using the `pg` library.
 *
 * Uses a connection pool for all queries. Fully async-native.
 */
export declare class PostgresAdapter implements IDatabaseAdapter {
    private pool;
    constructor(config: PostgresAdapterConfig);
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
//# sourceMappingURL=postgres.d.ts.map