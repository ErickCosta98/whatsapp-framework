# Migrating from raw Baileys to @erickcosta98/whatsapp-framework

This guide covers the migration from raw `@whiskeysockets/baileys` usage to the `@erickcosta98/whatsapp-framework` wrapper. Written for projects like repartia and senda-bot that currently use Baileys directly.

## What the framework replaces

| Concern | Raw Baileys | Framework |
|---------|-------------|-----------|
| Socket creation | `makeWASocket({...})` | `engine.connect(name)` |
| Auth state management | `useMultiFileAuthState(path)` | `authDir` config + `connect()` |
| Message normalization | Manual `extractMessageContent`, `getContentType` | Automatic — `message.type`, `message.body`, `message.media` |
| JID handling | Manual `@s.whatsapp.net` stripping | Automatic `@c.us` normalization |
| LID resolution | Manual `lid-mapping.update` handling | Automatic via `senderPhone` |
| Reconnection | Custom backoff logic | Built-in exponential backoff |
| Session management | Manual Map of sockets | `SessionManager` + `listSessions()` |
| Message retry | Custom `getMessage` store | Built-in ring buffer + adapter persist |
| Typing simulation | Manual `sendPresenceUpdate` | Config-based + automatic |
| Bulk throttling | Custom delay loops | `createThrottle()` |
| Database persistence | Custom SQL | `SQLiteAdapter` / `MySQLAdapter` / `PostgresAdapter` |
| QR / pairing handling | Manual event → HTTP bridge | Typed `"connection"` event with `qr` and `pairingCode` |
| Error handling | Manual disconnect classification | Automatic terminal vs transient handling |

## What you still do yourself

- **HTTP/WSS bridge**: Exposing QR codes and pairing codes to clients (the framework emits them as events — you decide how to expose them).
- **Business logic**: Command routing, NLP, integrations with external services.
- **Message storage for app use**: The adapter stores messages for the retry protocol. If you need full message history for app features, add your own table/collection.
- **Custom presence**: Manual `sendPresenceUpdate` for "available" / "unavailable" (the framework only handles "composing" / "recording" / "paused" via `sendChatState`).

## Before / After

### Setup

**Before** (raw Baileys):

```ts
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const authDir = "./auth/bot-1";
await fs.promises.mkdir(authDir, { recursive: true });

const { state, saveCreds } = await useMultiFileAuthState(authDir);
const { version } = await fetchLatestBaileysVersion();

const sock = makeWASocket({
  auth: state,
  version,
  browser: ["My Bot", "Chrome", "120.0.0"],
  printQRInTerminal: false,
  logger: pino({ level: "warn" }),
  getMessage: async (key) => { /* custom store lookup */ },
});

sock.ev.on("creds.update", saveCreds);
sock.ev.on("connection.update", handleConnection);
sock.ev.on("messages.upsert", handleMessages);
```

**After** (framework):

```ts
import { WhatsAppEngine, SQLiteAdapter } from "@erickcosta98/whatsapp-framework";

const engine = new WhatsAppEngine({
  authDir: "./auth",
  logLevel: "warn",
});

const adapter = new SQLiteAdapter({ filePath: "./data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);

engine.on("connection", handleConnection);
engine.on("message", ({ message }) => handleMessage(message));

await engine.connect("bot-1");
```

### Connection handling

**Before** (raw Baileys):

```ts
sock.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    console.log("QR:", qr);
    sendQrToClient(qr);
  }

  if (connection === "open") {
    console.log("Connected!");
  }

  if (connection === "close") {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
    if (statusCode === 401 || statusCode === 403) {
      console.log("Terminal disconnect");
    } else {
      // Manual reconnection logic
      setTimeout(() => connectWithNewSocket(), 5000);
    }
  }
});
```

**After** (framework):

```ts
engine.on("connection", ({ sessionName, status, qr, phone }) => {
  if (status === "qr") {
    sendQrToClient(qr);
  }
  if (status === "connected") {
    console.log(`Connected as ${phone}`);
  }
  if (status === "logged_out") {
    console.log("Terminal disconnect — credentials invalid");
  }
  // Reconnection is automatic for transient disconnects
});
```

### Receiving messages

**Before** (raw Baileys):

```ts
sock.ev.on("messages.upsert", ({ messages }) => {
  for (const msg of messages) {
    if (!msg.key?.remoteJid || !msg.key.id) continue;

    const content = extractMessageContent(msg.message);
    const type = getContentType(content);

    let body = "";
    if (type === "conversation") {
      body = content.conversation ?? "";
    } else if (type === "extendedTextMessage") {
      body = content.extendedTextMessage?.text ?? "";
    } else if (type === "imageMessage") {
      body = content.imageMessage?.caption ?? "";
    }
    // ... etc for every type

    const from = msg.key.remoteJid.replace("@s.whatsapp.net", "@c.us");
    const isGroup = from.endsWith("@g.us");

    console.log(`${from}: ${body}`);
  }
});
```

**After** (framework):

```ts
engine.on("message", ({ message }) => {
  // Everything is already normalized
  console.log(`${message.from}: ${message.body}`);

  // Type is pre-detected
  if (message.type === "image") {
    console.log(`Image: ${message.media?.mimetype}`);
  }

  if (message.isGroup) {
    console.log(`Group message from ${message.from} in ${message.chatId}`);
  }
});
```

### Sending messages

**Before** (raw Baileys):

```ts
const jid = "5215551234567@s.whatsapp.net";

// Text
await sock.sendMessage(jid, { text: "Hello!" });

// Image
await sock.sendMessage(jid, {
  image: buffer,
  caption: "Photo",
  mimetype: "image/jpeg",
});

// Typing indicator
await sock.sendPresenceUpdate("composing", jid);
```

**After** (framework):

```ts
const chatId = "5215551234567@c.us"; // neutral dialect — no @s.whatsapp.net

// Text
await engine.sendText("bot-1", chatId, "Hello!");

// Image
await engine.sendMedia("bot-1", chatId, {
  mimetype: "image/jpeg",
  data: buffer,
  caption: "Photo",
});

// Typing indicator
await engine.sendChatState("bot-1", chatId, "typing");
```

### Bulk messaging with throttling

**Before** (raw Baileys):

```ts
const delay = 3000;
let lastSend = 0;

for (const recipient of recipients) {
  const now = Date.now();
  const elapsed = now - lastSend;
  const jitter = Math.floor(Math.random() * 2000);
  const wait = Math.max(0, delay + jitter - elapsed);

  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  await sock.sendMessage(recipient, { text: "Bulk message" });
  lastSend = Date.now();
}
```

**After** (framework):

```ts
import { createThrottle } from "@erickcosta98/whatsapp-framework";

const throttle = createThrottle(3000, 2000);

for (const recipient of recipients) {
  await throttle.wait();
  await engine.sendText("bot-1", recipient, "Bulk message");
}
```

### LID (privacy) handling

**Before** (raw Baileys):

```ts
const lidMap = new Map<string, string>();

sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
  if (lid && pn) lidMap.set(lid, pn);
});

// When encountering an LID sender:
const senderJid = msg.key.remoteJid;
let deliverableJid = senderJid;
if (senderJid.endsWith("@lid")) {
  const phone = lidMap.get(senderJid);
  if (phone) deliverableJid = phone + "@s.whatsapp.net";
}
```

**After** (framework):

```ts
// LID mapping is automatic — no code needed

engine.on("message", ({ message }) => {
  if (message.isLidSender) {
    // The framework has already attempted to resolve the phone
    console.log(`LID message from ${message.from}, phone: ${message.senderPhone ?? "unknown"}`);
  }
});

// When sending to an LID, resolution is automatic:
// engine.sendText("bot-1", "abc123@lid", "Hello!");
// resolves via the internal lidMap automatically
```

### Multi-session

**Before** (raw Baileys):

```ts
const sessions = new Map<string, any>();

async function createSession(name: string) {
  const authDir = `./auth/${name}`;
  await fs.promises.mkdir(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version /* ... */ });
  sessions.set(name, { sock, saveCreds });
}

// Manual tracking of statuses, disconnects, etc.
```

**After** (framework):

```ts
const engine = new WhatsAppEngine({ authDir: "./auth" });

// One event handler works for all sessions — identify by sessionName
engine.on("connection", ({ sessionName, status }) => {
  console.log(`[${sessionName}] ${status}`);
});

engine.on("message", ({ sessionName, message }) => {
  console.log(`[${sessionName}] ${message.from}: ${message.body}`);
});

await engine.connect("bot-1");
await engine.connect("bot-2");

engine.listSessions(); // => ["bot-1", "bot-2"]
```

## Common Pitfalls

### JID format

- **Framework**: `5215551234567@c.us` (neutral dialect)
- **Raw Baileys**: `5215551234567@s.whatsapp.net` (raw dialect)

The framework normalizes JIDs internally. Use `@c.us` for inputs and all outputs use `@c.us`. Never pass `@s.whatsapp.net` to framework methods.

### Phone number format for pairing

- **Framework `requestPairingCode`**: `+5215551234567` (E.164 format)
- **Raw Baileys `requestPairingCode`**: same format — no change here

### Adapter is mandatory

Raw Baileys works without any database. The framework **requires** a registered adapter before `connect()`. If you don't need persistence, use SQLiteAdapter — it's zero-config and lightweight.

```ts
// Minimum viable adapter — SQLite with an ephemeral file
const adapter = new SQLiteAdapter({ filePath: "./data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);
```

### `message` event shape

Raw Baileys emits `{ messages: WAMessage[], type: string }`. The framework emits `{ sessionName: string, message: NormalizedMessage }` — one at a time, already unwrapped and normalized. If your existing handler iterates over `messages`, refactor it to handle single messages.

### Auth file location

- **Raw Baileys**: you manage the path (e.g., `./auth/bot-1/`)
- **Framework**: `authDir/<sessionName>/` — same pattern, just automatic

If you're migrating an existing session, copy your auth files to `authDir/<sessionName>/` before calling `connect()`.

### No direct socket access

The framework intentionally does not expose the raw Baileys `WASocket`. If you need operations not supported by the framework API (`sendMessage` with custom content types, group management beyond what's exposed), you have two options:

1. **Add it to the framework** — it belongs there for all projects
2. **Use `SessionManager` directly** — access `session.socket` if you really need to bypass the abstraction (not recommended)
