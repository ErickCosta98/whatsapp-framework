import { describe, it, expect } from "vitest";
import { createMessageStore } from "../src/retry/store.js";

describe("retry/store", () => {
  it("stores and retrieves a message", () => {
    const store = createMessageStore();
    store.set("msg-1", { text: "hello" });
    expect(store.get("msg-1")).toEqual({ text: "hello" });
  });

  it("returns undefined for unknown keys", () => {
    const store = createMessageStore();
    expect(store.get("missing")).toBeUndefined();
  });

  it("clears all messages", () => {
    const store = createMessageStore();
    store.set("a", 1);
    store.set("b", 2);
    store.clear();
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it("tracks size correctly", () => {
    const store = createMessageStore();
    expect(store.size()).toBe(0);
    store.set("a", 1);
    expect(store.size()).toBe(1);
    store.set("b", 2);
    expect(store.size()).toBe(2);
    store.set("a", 3); // overwrite
    expect(store.size()).toBe(2);
  });

  it("evicts the oldest entry when maxSize is reached", () => {
    const store = createMessageStore(3);
    store.set("a", 1);
    store.set("b", 2);
    store.set("c", 3);
    store.set("d", 4); // should evict "a"

    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toBe(2);
    expect(store.get("c")).toBe(3);
    expect(store.get("d")).toBe(4);
    expect(store.size()).toBe(3);
  });

  it("does not evict on overwrite", () => {
    const store = createMessageStore(2);
    store.set("a", 1);
    store.set("b", 2);
    store.set("a", 10); // overwrite, no eviction

    expect(store.get("a")).toBe(10);
    expect(store.get("b")).toBe(2);
    expect(store.size()).toBe(2);
  });

  it("uses default maxSize of 5000", () => {
    const store = createMessageStore();
    for (let i = 0; i < 5_005; i++) {
      store.set(`key-${i}`, i);
    }
    expect(store.size()).toBe(5_000);
    expect(store.get("key-0")).toBeUndefined(); // oldest evicted
    expect(store.get("key-5004")).toBe(5004);
  });
});
