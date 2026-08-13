# @erickcosta98/whatsapp-framework

TypeScript WhatsApp framework built on Baileys ^7.0.0-rc13. Multi-session, anti-ban protections, database abstraction, message normalization. Now also supports Facebook Messenger via `@neoaz07/nkxfca`. Drop-in replacement for raw Baileys in production bots.

## Requirements

- **Node.js** >= 22.0.0
- **better-sqlite3** ^11.0.0 (optional — only for SQLite adapter)
- **mysql2** ^3.0.0 (optional — only for MySQL adapter)
- **pg** ^8.0.0 (optional — only for PostgreSQL adapter)
- **@neoaz07/nkxfca** ^1.0.10 (optional — only for Messenger support)

## Quick Start — WhatsApp

```bash
npm install github:ErickCosta98/whatsapp-framework#master
```

```ts
import { WhatsAppEngine, SQLiteAdapter } from "@erickcosta98/whatsapp-framework";

const engine = new WhatsAppEngine({ authDir: "./auth" });
const adapter = new SQLiteAdapter({ filePath: "./data.db" });

await adapter.initialize();
engine.registerAdapter(adapter);

// Listen for incoming messages
engine.on("message", ({ message }) => {
  console.log(`${message.from}: ${message.body}`);
});

// Track connection status
engine.on("connection", ({ status, qr }) => {
  if (status === "qr") console.log("Scan this QR:", qr);
  if (status === "connected") console.log("Online!");
});

await engine.connect("bot-1");

// Send a message
await engine.sendText("bot-1", "5215551234567@c.us", "Hello from the framework!");

// Graceful shutdown
await engine.stop();
```

## Quick Start — Messenger

Install the optional peer dependency:

```bash
npm install @neoaz07/nkxfca@1.0.10
```

```ts
import { createEngine, SQLiteAdapter } from "@erickcosta98/whatsapp-framework";

const engine = createEngine("messenger", { appState: process.env.APPSTATE_JSON });
const adapter = new SQLiteAdapter({ filePath: "./data.db" });

await adapter.initialize();
engine.registerAdapter(adapter);

engine.on("connection", ({ sessionName, status }) => {
  console.log(`[${sessionName}] ${status}`);
});

engine.on("message", ({ sessionName, message }) => {
  if (message.fromMe) return;
  console.log(`[${sessionName}] ${message.from}: ${message.body}`);
});

await engine.connect("bot-1");
```

**Security note**: `appState` contains real Facebook session cookies. Encrypt it before persistence and decrypt on load:

```ts
const engine = createEngine("messenger", {
  appState: process.env.APPSTATE_JSON,
  encryptAppState: (plain) => encrypt(plain, key),
  decryptAppState: (cipher) => decrypt(cipher, key),
});
```

The adapter stores the encrypted value so the bot can reconnect after restart without re-authenticating.

**Platform-specific gaps**:
- **No QR / pairing code flow** — `getQR()`, `getPairingCode()`, and `requestPairingCode()` return `null` or reject.
- **Synthetic delivery acks** — `message:ack` emits `"delivered"` immediately after `sendText`/`sendMedia` resolves. Do not rely on it for actual delivery confirmation.
- **No reaction events** — `message:reaction` is never emitted for Messenger sessions.
- **Chat state limitation** — `sendChatState("recording")` throws; only `"typing"` and `"paused"` are supported.
- **Personal accounts only** — the Messenger engine authenticates **personal** Facebook accounts via `@neoaz07/nkxfca`. **Facebook Page accounts are not supported** (nkxfca connects to MQTT for pages but never delivers real-time events). For page bots, a future workstream will use the official Meta Graph API (webhook + Page Access Token).

## Configuration

### `new WhatsAppEngine(config)` — all options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authDir` | `string` | **required** | Directory for Baileys auth state files. One subdirectory per session. |
| `browser` | `[string, string, string]` | `["WhatsApp Framework", "Chrome", "120.0.0"]` | Browser identity tuple sent to WA servers. |
| `markOnlineOnConnect` | `boolean` | `false` | Mark the account as "online" when the socket opens. |
| `simulateTyping` | `boolean` | `true` | Insert a typing delay before sending text messages. |
| `simulateTypingMaxMs` | `number` | `5000` | Maximum typing simulation delay in milliseconds. |
| `delayBetweenMessages` | `number` | `3000` | Base delay between bulk sends in milliseconds. |
| `randomizeDelay` | `boolean` | `true` | Add random jitter (0–2000ms) between bulk sends. |
| `messageStoreCap` | `number` | `5000` | Max messages stored per session for retry protocol. |
| `logLevel` | `string` | `"warn"` | Pino log level (`"fatal"`, `"error"`, `"warn"`, `"info"`, `"debug"`, `"trace"`). |
| `mediaMaxSize` | `number` | `52428800` (50 MB) | Maximum media upload size in bytes. |

### `new MessengerEngine(config)` — all options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appState` | `string` | — | Encrypted or raw Facebook `appState` JSON string. |
| `email` | `string` | — | Facebook email (alternative to `appState`). |
| `password` | `string` | — | Facebook password (required with `email`). |
| `logLevel` | `string` | `"warn"` | Pino log level. |
| `mediaMaxSize` | `number` | `52428800` (50 MB) | Maximum media upload size in bytes. |
| `encryptAppState` | `(plain: string) => string` | identity | Hook to encrypt appState before adapter persistence. |
| `decryptAppState` | `(cipher: string) => string` | identity | Hook to decrypt appState after adapter read. |

## API Reference

### `engine.registerAdapter(adapter: IDatabaseAdapter): void`

Register a database adapter for session persistence, message storage, and LID mapping. Must be called before `connect()`.

```ts
engine.registerAdapter(new SQLiteAdapter({ filePath: "./data.db" }));
```

### `engine.connect(name: string): Promise<void>`

Start a named session. Loads/creates auth state, opens a Baileys socket, and begins listening for QR, connection, and message events.

```ts
await engine.connect("bot-1");
await engine.connect("bot-2");
```

- **Throws** if no adapter is registered.
- **Idempotent** — calling `connect()` while already connecting is a no-op.
- **Reconnects automatically** on transient disconnects with exponential backoff.

### `engine.disconnect(name: string): Promise<void>`

Gracefully stop a session: clear timers, close the socket, mark as intentionally disconnected.

```ts
await engine.disconnect("bot-1");
```

### `engine.stop(): Promise<void>`

Stop all sessions and remove all event listeners.

```ts
await engine.stop();
```

### `engine.requestPairingCode(name: string, phoneNumber: string): Promise<string>`

Request a pairing code as an alternative to QR scanning. The phone number is the **target device** number, prefixed with country code.

```ts
const code = await engine.requestPairingCode("bot-1", "+5215551234567");
console.log("Enter this code on your phone:", code);
```

- **Throws** if the session is not initialized or already authenticated.
- **Throws** if the phone number format is invalid (must match `/^\+[1-9]\d{7,14}$/`).
- **Not supported** for Messenger (always rejects).

### `engine.sendText(name: string, chatId: string, text: string): Promise<SendResult>`

Send a text message through a connected session.

```ts
const result = await engine.sendText("bot-1", "5215551234567@c.us", "Hello!");
// => { id: "BAE5...", timestamp: 1723123456789 }
```

- **Throws** if the session is not connected.
- On WhatsApp, respects `simulateTyping` config — if enabled, waits before sending.

### `engine.sendMedia(name: string, chatId: string, media: MediaInput): Promise<SendResult>`

Send media (image, video, audio, document) through a connected session.

```ts
import { readFileSync } from "fs";

const result = await engine.sendMedia("bot-1", "5215551234567@c.us", {
  mimetype: "image/jpeg",
  data: readFileSync("./photo.jpg"),
  caption: "Check this out!",
});
```

`MediaInput` fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mimetype` | `string` | yes | MIME type (`image/jpeg`, `video/mp4`, `audio/ogg`, `application/pdf`, etc.) |
| `data` | `Buffer \| string` | yes | File contents (Buffer, base64 string, or URL) |
| `filename` | `string` | no | File name (required for document type) |
| `caption` | `string` | no | Caption text |
| `mentions` | `string[]` | no | JIDs to @mention |
| `ptt` | `boolean` | no | Send audio as a voice note (PTT). Ignored for non-audio types. |

- **Throws** if the session is not connected.
- **Throws** if media exceeds `mediaMaxSize`.

### `engine.sendChatState(name: string, chatId: string, state: ChatState): Promise<void>`

Send a chat state indicator to a chat.

```ts
await engine.sendChatState("bot-1", "5215551234567@c.us", "typing");
await engine.sendChatState("bot-1", "5215551234567@c.us", "recording");
await engine.sendChatState("bot-1", "5215551234567@c.us", "paused");
```

`ChatState`: `"typing"` | `"recording"` | `"paused"`

- Messenger only supports `"typing"` and `"paused"`; `"recording"` throws.

### `engine.getStatus(name: string): string | undefined`

Get the current connection status of a session.

```ts
const status = engine.getStatus("bot-1");
// "initializing" | "qr" | "pairing_code" | "connecting" | "connected" | "disconnected" | "logged_out"
```

### `engine.getQR(name: string): string | null`

Get the current QR code data URL for a session, or `null` if none.

```ts
const qr = engine.getQR("bot-1");
```

- Always `null` for Messenger.

### `engine.getPairingCode(name: string): string | null`

Get the current pairing code for a session, or `null` if none.

```ts
const code = engine.getPairingCode("bot-1");
```

- Always `null` for Messenger.

### `engine.listSessions(): string[]`

Return all managed session names.

```ts
const names = engine.listSessions(); // => ["bot-1", "bot-2"]
```

### `createEngine(platform, config)`

Factory that returns the correct engine for the platform:

```ts
import { createEngine } from "@erickcosta98/whatsapp-framework";

const wa = createEngine("whatsapp", { authDir: "./auth" });
const ms = createEngine("messenger", { appState: "..." });
```

- Throws `"Unsupported platform: <platform>"` for unknown platforms.
- Throws `"Missing optional peer dependency @neoaz07/nkxfca..."` when creating a Messenger engine without nkxfca installed.

## Events

The engine is an `EventEmitter`. All events are strongly typed.

| Event | Payload | When |
|-------|---------|------|
| `connection` | `ConnectionEvent` | Session status changes. |
| `message` | `MessageEvent` | Inbound message received. |
| `message:create` | `MessageEvent` | Outgoing message created by *this* account. |
| `message:ack` | `[messageId: string, status: string]` | Delivery status update. |
| `message:revoked` | `{ id, revokedId?, chatId, from, to, timestamp }` | Message remotely deleted. |
| `message:reaction` | `{ messageId, chatId, reaction, senderId }` | Reaction added to a message. |
| `error` | `{ sessionName: string, error: Error }` | Session-level error. |

### Messenger event notes

- `message:ack` is **synthetic** — emitted immediately after a successful `sendText`/`sendMedia` with status `"delivered"`. Do not rely on it for actual delivery confirmation.
- `message:reaction` is **never emitted** for Messenger sessions.
- `connection` statuses for Messenger are: `initializing`, `connecting`, `connected`, `disconnected`, `failed`.

### ConnectionEvent

```ts
interface ConnectionEvent {
  sessionName: string;
  status: "initializing" | "qr" | "pairing_code" | "connecting"
        | "connected" | "disconnected" | "reconnecting" | "logged_out" | "failed";
  qr?: string;           // QR code data URL (only when status is "qr")
  pairingCode?: string;   // Pairing code (only when status is "pairing_code")
  phone?: string | null;  // Phone number of the connected account
  pushName?: string | null; // Push name of the connected account
  reason?: string;        // Human-readable reason for disconnect/failure
}
```

### MessageEvent

```ts
interface MessageEvent {
  sessionName: string;
  message: NormalizedMessage;
}
```

## Message Types

### NormalizedMessage

All inbound messages are normalized to this shape, regardless of the raw Baileys format.

```ts
interface NormalizedMessage {
  id: string;
  from: string;          // Sender JID (neutral dialect: phone@c.us or lid@lid)
  to: string;            // Recipient JID
  chatId: string;        // Chat JID (group or direct)
  body: string;          // Message text / caption
  type: MessageType;     // Detected message type
  timestamp: number;     // Unix timestamp
  fromMe: boolean;       // Sent by this account?
  isGroup: boolean;      // Is this a group message?
  media?: MediaPayload;  // Media metadata (if applicable)
  location?: LocationPayload; // Location data (if applicable)
  quotedMessage?: QuotedMessage; // Quoted message context
  ephemeralDuration?: number;   // Ephemeral message duration (seconds)
  isLidSender?: boolean;        // Is the sender a privacy-ID user?
  senderPhone?: string | null;  // Resolved phone number (when available)
  viewOnce?: boolean;           // Is this a view-once message?
}
```

**MessageType**: `"text"` | `"image"` | `"video"` | `"audio"` | `"voice"` | `"document"` | `"sticker"` | `"location"` | `"contact"` | `"poll"` | `"reaction"` | `"revoked"` | `"ephemeral"` | `"unknown"`

**MediaPayload**:

| Field | Type | Description |
|-------|------|-------------|
| `mimetype` | `string` | MIME type |
| `filename` | `string?` | Original filename |
| `data` | `string?` | Base64-encoded data (absent when omitted) |
| `omitted` | `boolean?` | `true` when media blob was dropped due to size/timeout |
| `sizeBytes` | `number?` | Decoded byte size (always set when omitted) |

**LocationPayload**:

| Field | Type | Description |
|-------|------|-------------|
| `latitude` | `number` | Latitude in degrees |
| `longitude` | `number` | Longitude in degrees |
| `description` | `string?` | Location name |
| `address` | `string?` | Street address |
| `url` | `string?` | Map URL |

### SendResult

```ts
interface SendResult {
  id: string;        // Message ID
  timestamp: number; // Send timestamp
}
```

## Database Adapters

Three adapters implement the `IDatabaseAdapter` interface. All share the same schema (sessions, messages, LID mappings, contacts, chats).

### SQLite

```ts
import { SQLiteAdapter } from "@erickcosta98/whatsapp-framework";

const adapter = new SQLiteAdapter({ filePath: "./data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);
```

Uses `better-sqlite3`. Synchronous under the hood, but the adapter wraps calls in `Promise.resolve()` for uniform async interface. Install: `npm install better-sqlite3`.

### MySQL

```ts
import { MySQLAdapter } from "@erickcosta98/whatsapp-framework/mysql";

const adapter = new MySQLAdapter({
  host: "localhost",
  user: "root",
  password: "secret",
  database: "whatsapp",
});
await adapter.initialize();
engine.registerAdapter(adapter);
```

Uses `mysql2/promise`. Install: `npm install mysql2`.

### PostgreSQL

```ts
import { PostgresAdapter } from "@erickcosta98/whatsapp-framework/postgres";

const adapter = new PostgresAdapter({
  host: "localhost",
  user: "postgres",
  password: "secret",
  database: "whatsapp",
});
await adapter.initialize();
engine.registerAdapter(adapter);
```

Uses `pg`. Install: `npm install pg`.

### Custom Adapter

Implement the `IDatabaseAdapter` interface:

```ts
import type { IDatabaseAdapter, SessionRecord, StoredMessage } from "@erickcosta98/whatsapp-framework";

class MyAdapter implements IDatabaseAdapter {
  async getSession(name: string): Promise<SessionRecord | null> { /* ... */ }
  async upsertSession(record: SessionRecord): Promise<void> { /* ... */ }
  async deleteSession(name: string): Promise<void> { /* ... */ }
  async getMessage(sessionName: string, messageId: string): Promise<StoredMessage | null> { /* ... */ }
  async putMessage(sessionName: string, msg: StoredMessage): Promise<void> { /* ... */ }
  async clearSessionMessages(sessionName: string): Promise<void> { /* ... */ }
  async getLidMapping(lid: string): Promise<string | null> { /* ... */ }
  async upsertLidMapping(lid: string, pn: string): Promise<void> { /* ... */ }
  async listContacts(): Promise<ContactRecord[]> { /* ... */ }
  async upsertContact(contact: ContactRecord): Promise<void> { /* ... */ }
  async listChats(): Promise<ChatRecord[]> { /* ... */ }
  async upsertChat(chat: ChatRecord): Promise<void> { /* ... */ }
}
```

### Prisma (PostgreSQL / MySQL)

If your project already uses Prisma, create a `PrismaAdapter` instead of using the raw driver adapters. A complete reference implementation is in [`examples/prisma-adapter/`](examples/prisma-adapter/).

**What you need:**

1. Add 5 tables to your Prisma schema (`wa_auth_state`, `wa_lid_mappings`, `wa_message_store`, `wa_contacts`, `wa_chats`)
2. Implement the `IDatabaseAdapter` interface using your Prisma client
3. Register it: `engine.registerAdapter(new PrismaAdapter())`

```ts
import { PrismaAdapter } from "./prismaAdapter.js";
import { WhatsAppEngine } from "@erickcosta98/whatsapp-framework";

const engine = new WhatsAppEngine({ authDir: "./auth" });
await engine.registerAdapter(new PrismaAdapter());
```

These tables are **separate** from your business data — the framework uses them for internal state (auth, LID mappings, retry protocol). Your existing Prisma models stay untouched.

## Anti-Ban Protections

### Simulated Typing

When `simulateTyping` is `true` (default), the engine pauses before sending text messages to mimic human typing speed. Configured via `simulateTypingMaxMs`.

**Formula**: `500ms + text.length * 45ms`, capped at `simulateTypingMaxMs`, with ±15% random jitter.

```ts
import { simulateTyping, simulateTypingDelay } from "@erickcosta98/whatsapp-framework";

// Async — actually sleeps
await simulateTyping(message.length);

// Sync — returns milliseconds
const ms = simulateTypingDelay(message.length);
```

### Bulk Throttling

For sending messages in bulk, use the throttle utility to avoid rate limits.

```ts
import { createThrottle } from "@erickcosta98/whatsapp-framework";

const throttle = createThrottle(3000, 2000); // baseDelay, jitterMax

for (const recipient of recipients) {
  await throttle.wait();
  await engine.sendText("bot-1", recipient, "Hello!");
}
```

Each `throttle.wait()` enforces `baseDelay + random(0, jitterMax)` between consecutive calls.

## LID Resolution

WhatsApp uses two JID dialects:

- **Phone-based**: `5215551234567@c.us` — user known by phone number
- **Privacy-based (LID)**: `abc123@lid` — user whose phone is unknown

The framework normalizes all JIDs to the neutral `@c.us` dialect and maintains an LID → phone mapping table. Resolution order:

1. If the JID is an LID mapped to a known phone → uses `phone@c.us`
2. If the JID is an LID with no known phone → uses it as-is (WA can still deliver)
3. Otherwise → normalizes to `@c.us`

```ts
import { normalizeJid, isLidJid, resolveDeliverableJid } from "@erickcosta98/whatsapp-framework";

normalizeJid("5215551234567@s.whatsapp.net"); // => "5215551234567@c.us"
isLidJid("abc123@lid");                       // => true
```

## Message Normalization

Every inbound Baileys `WAMessage` goes through a normalization pipeline:

1. **Unwrap** view-once / ephemeral wrappers to expose inner content
2. **Detect** message type (text, image, video, audio, voice, document, sticker, location, contact, poll, reaction)
3. **Resolve** sender JID via LID mapping
4. **Build** a `NormalizedMessage` with clean, predictable fields

```ts
import { normalizeIncomingMessage, detectMessageType } from "@erickcosta98/whatsapp-framework";

const normalized = normalizeIncomingMessage(rawBaileysMessage, lidMap);
```

## Message Retry Protocol

Sent messages are stored in a per-session ring buffer (size: `messageStoreCap`). When WA servers request retransmission, the stored message is retrieved and re-sent automatically. No user code needed.

## Reconnection Backoff

Transient disconnects trigger automatic reconnection with exponential backoff:

| Attempt | Base Delay | Description |
|---------|-----------|-------------|
| 1 | ~1s | First retry |
| 2 | ~2s | x2 |
| 3 | ~4s | x4 |
| ... | ... | Doubles each attempt |
| 7+ | ~60s | Capped at 60 seconds |

**Terminal errors** (401, 403, 440) stop reconnection permanently:
- **401**: Logged out / unauthorized — auth files are deleted
- **403**: Forbidden / banned
- **440**: Connection replaced by another session

## Multi-Session

Manage multiple WhatsApp numbers in a single process:

```ts
const engine = new WhatsAppEngine({ authDir: "./auth" });

engine.on("connection", ({ sessionName, status }) => {
  console.log(`[${sessionName}] ${status}`);
});

engine.on("message", ({ sessionName, message }) => {
  console.log(`[${sessionName}] ${message.from}: ${message.body}`);
});

await engine.connect("support");
await engine.connect("sales");

await engine.sendText("support", "user@c.us", "How can I help?");
await engine.sendText("sales", "client@c.us", "New offer!");
```

Each session has:
- Independent auth state stored in `authDir/<sessionName>/`
- Independent connection state (QR, pairing, connected, disconnected)
- Independent reconnection and error handling

## Exports Summary

### Main entry (`@erickcosta98/whatsapp-framework`)

| Export | Kind | Description |
|--------|------|-------------|
| `WhatsAppEngine` | class | Core engine class |
| `SessionManager` | class | Session lifecycle manager |
| `SQLiteAdapter` | class | SQLite adapter |
| `simulateTyping` | fn | Async typing delay |
| `simulateTypingDelay` | fn | Sync typing delay calculator |
| `createThrottle` | fn | Bulk send throttler factory |
| `normalizeJid` | fn | JID normalization |
| `isLidJid` | fn | LID check |
| `resolveDeliverableJid` | fn | LID → phone resolution |
| `normalizeIncomingMessage` | fn | Message normalization |
| `normalizeSentResult` | fn | Send result normalization |
| `detectMessageType` | fn | Message type detection |
| `createMessageStore` | fn | Message store factory |
| `MessengerEngine` | class | Messenger engine class |
| `createEngine` | fn | Platform-selecting factory |
| `normalizeMessengerMessage` | fn | Messenger message normalizer |
| `bufferToReadStream` | fn | Buffer → ReadStream for Messenger |

### Sub-path exports

| Import path | Export |
|-------------|--------|
| `@erickcosta98/whatsapp-framework/mysql` | `MySQLAdapter` |
| `@erickcosta98/whatsapp-framework/postgres` | `PostgresAdapter` |
| `@erickcosta98/whatsapp-framework/messenger` | `MessengerEngine`, `createEngine`, `normalizeMessengerMessage`, `bufferToReadStream` |

All types are re-exported from the main entry.
