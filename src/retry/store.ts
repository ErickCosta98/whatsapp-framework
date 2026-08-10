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
export function createMessageStore(maxSize: number = 5_000): MessageStore {
  const map = new Map<string, unknown>();

  return {
    set(key: string, message: unknown): void {
      if (map.size >= maxSize && !map.has(key)) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) {
          map.delete(firstKey);
        }
      }
      map.set(key, message);
    },

    get(key: string): unknown | undefined {
      return map.get(key);
    },

    clear(): void {
      map.clear();
    },

    size(): number {
      return map.size;
    },
  };
}
