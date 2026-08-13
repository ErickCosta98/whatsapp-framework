/**
 * messenger-usage.ts — whatsapp-framework example
 *
 * Demonstrates: Messenger setup with createEngine, appState connect,
 * send text, send media, receive messages, connection events,
 * SQLite adapter, and encrypted appState.
 *
 * Run: npx tsx examples/messenger-usage.ts
 *
 * Requires: npm install @neoaz07/nkxfca@1.0.10
 */

import { createEngine, SQLiteAdapter } from "@erickcosta98/whatsapp-framework";

// ─── 1. Setup ──────────────────────────────────────────────────────────

const engine = createEngine("messenger", {
  appState: process.env.APPSTATE_JSON,
  logLevel: "info",
});

const adapter = new SQLiteAdapter({ filePath: "./messenger-data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);

// ─── 2. Connection events ──────────────────────────────────────────────

engine.on("connection", ({ sessionName, status }) => {
  switch (status) {
    case "connected":
      console.log(`[${sessionName}] Connected`);
      break;
    case "disconnected":
      console.log(`[${sessionName}] Disconnected`);
      break;
    case "failed":
      console.log(`[${sessionName}] Connection failed`);
      break;
    default:
      console.log(`[${sessionName}] Status: ${status}`);
  }
});

engine.on("error", ({ sessionName, error }) => {
  console.error(`[${sessionName}] Error:`, error.message);
});

// ─── 3. Incoming messages ──────────────────────────────────────────────

engine.on("message", ({ sessionName, message }) => {
  if (message.fromMe) return;

  console.log(`[${sessionName}] ${message.from}: ${message.body}`);

  if (message.media) {
    console.log(`  Media: ${message.media.mimetype}`);
  }

  // Auto-reply example
  if (message.body.toLowerCase().includes("hello")) {
    engine.sendText(sessionName, message.chatId, "Hello there! 👋");
  }
});

// ─── 4. Synthetic delivery acks ────────────────────────────────────────

engine.on("message:ack", (messageId, status) => {
  console.log(`  Ack: ${messageId} -> ${status} (synthetic on Messenger)`);
});

// ─── 5. Connect ────────────────────────────────────────────────────────

await engine.connect("bot-1");

// ─── 6. Send text message ──────────────────────────────────────────────

await engine.sendText("bot-1", "123456789", "Hello from the Messenger Framework!");

// ─── 7. Send chat state (typing indicator) ─────────────────────────────

await engine.sendChatState("bot-1", "123456789", "typing");
await new Promise((r) => setTimeout(r, 2000)); // simulate thinking

// ─── 8. Send media ─────────────────────────────────────────────────────

await engine.sendMedia("bot-1", "123456789", {
  mimetype: "image/jpeg",
  data: Buffer.from("fake-image-data"), // replace with real data
  caption: "Check out this photo!",
});

// ─── 9. Multi-session ────────────────────────────────────────────────

console.log("Active sessions:", engine.listSessions());

for (const name of engine.listSessions()) {
  const status = engine.getStatus(name);
  console.log(`  ${name}: ${status}`);
}

// ─── 10. Graceful shutdown ────────────────────────────────────────────

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await engine.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await engine.stop();
  process.exit(0);
});

console.log("Messenger engine running. Press Ctrl+C to stop.");
