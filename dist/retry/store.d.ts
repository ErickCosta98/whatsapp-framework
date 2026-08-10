/**
 * In-memory message store for the Baileys retry protocol.
 *
 * Acts as a ring buffer: when `maxSize` is reached, the oldest entry
 * (first inserted) is evicted before the new one is stored.
 *
 * This store is used as the `getMessage` callback in the Baileys socket
 * configuration so that retryable messages can be re-sent when the server
 * requests them.
 */
export interface StoredMessageEntry {
    key: string;
    message: unknown;
}
export interface MessageStore {
    /** Store a message keyed by its ID. */
    set(key: string, message: unknown): void;
    /** Retrieve a message by its ID, or undefined if absent / evicted. */
    get(key: string): unknown | undefined;
    /** Remove all stored messages. */
    clear(): void;
    /** Current number of stored messages. */
    size(): number;
}
/**
 * Create a message store with ring-buffer eviction.
 *
 * @param maxSize — maximum number of messages to retain (default 5000)
 * @returns MessageStore instance
 */
export declare function createMessageStore(maxSize?: number): MessageStore;
//# sourceMappingURL=store.d.ts.map