/**
 * basic-usage.ts — whatsapp-framework example
 *
 * Demonstrates: setup, QR connect, pairing code connect, send text,
 * send media, receive messages, connection events, SQLite adapter,
 * and multi-session.
 *
 * Run: npx tsx examples/basic-usage.ts
 */

import { WhatsAppEngine, SQLiteAdapter, createThrottle } from "@gentle/whatsapp-framework";

// ─── 1. Setup ──────────────────────────────────────────────────────────

const engine = new WhatsAppEngine({
  authDir: "./auth",
  simulateTyping: true,
  simulateTypingMaxMs: 5000,
  logLevel: "info",
});

const adapter = new SQLiteAdapter({ filePath: "./data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);

// ─── 2. Connection events ──────────────────────────────────────────────

engine.on("connection", ({ sessionName, status, qr, pairingCode, phone }) => {
  switch (status) {
    case "qr":
      console.log(`[${sessionName}] Scan QR code: ${qr}`);
      break;
    case "pairing_code":
      console.log(`[${sessionName}] Enter pairing code on phone: ${pairingCode}`);
      break;
    case "connected":
      console.log(`[${sessionName}] Connected as ${phone}`);
      break;
    case "disconnected":
      console.log(`[${sessionName}] Disconnected`);
      break;
    case "logged_out":
      console.log(`[${sessionName}] Logged out — credentials invalid`);
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
    console.log(`  Media: ${message.media.mimetype} (${message.media.sizeBytes} bytes)`);
  }

  if (message.location) {
    console.log(`  Location: ${message.location.latitude}, ${message.location.longitude}`);
  }

  if (message.isLidSender) {
    console.log(`  LID sender, resolved phone: ${message.senderPhone ?? "unknown"}`);
  }

  // Auto-reply example
  if (message.body.toLowerCase().includes("hello")) {
    engine.sendText(sessionName, message.from, "Hello there! 👋");
  }
});

// ─── 4. Connect with QR code ───────────────────────────────────────────

await engine.connect("bot-1");

// Wait for QR to be available (polling in a real app)
// In production you'd expose this via an HTTP endpoint or WebSocket.
function waitForQR(timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const qr = engine.getQR("bot-1");
      if (qr) return resolve(qr);
      const status = engine.getStatus("bot-1");
      if (status === "connected") return resolve("already connected");
      if (status === "logged_out") return reject(new Error("Session logged out"));
      setTimeout(check, 500);
    };
    const timer = setTimeout(() => reject(new Error("QR timeout")), timeoutMs);
    const originalCheck = check;
    const checkWithTimeout = () => {
      clearTimeout(timer);
      originalCheck();
    };
    checkWithTimeout();
    setTimeout(() => {
      clearTimeout(timer);
      reject(new Error("QR timeout"));
    }, timeoutMs);
  });
}

// ─── 5. Connect with pairing code (alternative) ────────────────────────

await engine.connect("bot-2");

// Wait for the session to reach a state where we can request a pairing code.
function waitForPairingReady(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const status = engine.getStatus(name);
      if (status === "connecting" || status === "qr" || status === "pairing_code") {
        return resolve();
      }
      if (status === "connected") return resolve();
      if (status === "logged_out") return reject(new Error("Session logged out"));
      setTimeout(check, 500);
    };
    check();
  });
}

await waitForPairingReady("bot-2");
const pairingCode = await engine.requestPairingCode("bot-2", "+5215551234567");
console.log("Pairing code:", pairingCode);

// ─── 6. Wait for connection ────────────────────────────────────────────

function waitForConnection(name: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = ({ sessionName, status }: any) => {
      if (sessionName === name) {
        if (status === "connected") {
          engine.off("connection", handler);
          resolve();
        }
        if (status === "logged_out") {
          engine.off("connection", handler);
          resolve(); // resolved but not connected
        }
      }
    };
    engine.on("connection", handler);
  });
}

await waitForConnection("bot-1");
await waitForConnection("bot-2");

// ─── 7. Send text message ──────────────────────────────────────────────

await engine.sendText("bot-1", "5215551234567@c.us", "Hello from the WhatsApp Framework!");

// ─── 8. Send chat state (typing indicator) ─────────────────────────────

await engine.sendChatState("bot-1", "5215551234567@c.us", "typing");
await new Promise((r) => setTimeout(r, 2000)); // simulate thinking

// ─── 9. Send media ─────────────────────────────────────────────────────

await engine.sendMedia("bot-1", "5215551234567@c.us", {
  mimetype: "image/jpeg",
  data: Buffer.from("fake-image-data"), // replace with real data
  caption: "Check out this photo!",
});

// Voice note
await engine.sendMedia("bot-1", "5215551234567@c.us", {
  mimetype: "audio/ogg",
  data: Buffer.from("fake-audio-data"),
  ptt: true, // push-to-talk = voice note instead of audio file
});

// Document
await engine.sendMedia("bot-1", "5215551234567@c.us", {
  mimetype: "application/pdf",
  data: Buffer.from("fake-pdf-data"),
  filename: "report.pdf",
  caption: "Here's the report.",
});

// ─── 10. Bulk send with throttling ─────────────────────────────────────

const throttle = createThrottle(3000, 2000); // 3s base + 0–2s jitter

const recipients = [
  "5215551234567@c.us",
  "5215559876543@c.us",
  "5215551111111@c.us",
];

for (const recipient of recipients) {
  await throttle.wait();
  await engine.sendText("bot-1", recipient, "Bulk message with throttling!");
}

// ─── 11. Multi-session ─────────────────────────────────────────────────

console.log("Active sessions:", engine.listSessions());

for (const name of engine.listSessions()) {
  const status = engine.getStatus(name);
  console.log(`  ${name}: ${status}`);
}

// Send from bot-2 while bot-1 is also running
if (engine.getStatus("bot-2") === "connected") {
  await engine.sendText("bot-2", "5215551234567@c.us", "Message from bot-2!");
}

// ─── 12. Graceful shutdown ─────────────────────────────────────────────

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

console.log("Engine running. Press Ctrl+C to stop.");
