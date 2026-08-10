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
/**
 * Create a message store with ring-buffer eviction.
 *
 * @param maxSize — maximum number of messages to retain (default 5000)
 * @returns MessageStore instance
 */
export function createMessageStore(maxSize = 5_000) {
    const map = new Map();
    return {
        set(key, message) {
            if (map.size >= maxSize && !map.has(key)) {
                const firstKey = map.keys().next().value;
                if (firstKey !== undefined) {
                    map.delete(firstKey);
                }
            }
            map.set(key, message);
        },
        get(key) {
            return map.get(key);
        },
        clear() {
            map.clear();
        },
        size() {
            return map.size;
        },
    };
}
//# sourceMappingURL=store.js.map