# AGENTS.md — whatsapp-framework

## What this project is

`@erickcosta98/whatsapp-framework` is a private TypeScript npm package that wraps Baileys ^7.0.0-rc13 into a reusable WhatsApp framework for multi-session chatbots. It eliminates duplicated patterns across 3 projects (repartia, senda-bot, OpenWA) by standardizing connection management, message normalization, anti-ban protections, and database persistence.

## Architecture

```
src/
├── index.ts              # Public API barrel export
├── engine.ts             # WhatsAppEngine — core class (connect, disconnect, sendText, sendMedia, sendChatState, requestPairingCode, events)
├── session.ts            # SessionManager — in-memory Map<string, SessionInfo> tracking socket, status, QR, reconnect state
├── normalizer.ts         # Baileys WAMessage → NormalizedMessage pipeline (unwrap view-once, detect type, resolve JIDs)
├── types/
│   ├── index.ts          # Barrel re-export
│   ├── config.ts         # WhatsAppEngineConfig interface, ChatState type
│   ├── messages.ts       # NormalizedMessage, IncomingMessage, SendResult, MediaInput, MessageType, MediaPayload, etc.
│   ├── events.ts         # ConnectionEvent, MessageEvent, EngineEventMap, ConnectionStatus
│   └── adapter.ts        # IDatabaseAdapter interface, SessionRecord, StoredMessage, ContactRecord, ChatRecord
├── adapters/
│   ├── sqlite.ts         # SQLiteAdapter — better-sqlite3, synchronous under the hood, wrapped in Promise.resolve()
│   ├── mysql.ts          # MySQLAdapter — mysql2/promise connection pool
│   └── postgres.ts       # PostgresAdapter — pg Pool
├── anti-ban/
│   ├── typing.ts         # simulateTyping(delay) — 500ms + len*45ms capped ±15% jitter
│   └── throttling.ts     # createThrottle(baseDelay, jitterMax) — enforces delays between consecutive calls
├── lid/
│   └── resolver.ts       # normalizeJid, isLidJid, resolveDeliverableJid — JID dialect normalization
├── reconnect/
│   └── backoff.ts        # calculateBackoffDelay, isTerminalError, classifyDisconnect
└── retry/
    └── store.ts          # createMessageStore(maxSize) — ring-buffer Map for Baileys retry protocol
```

**Data flow**: `Baileys socket` → `messages.upsert` → `handleMessagesUpsert` → `normalizeIncomingMessage` → `emit("message", MessageEvent)` → user handler.

**Connection flow**: `connect(name)` → `useMultiFileAuthState(authDir/name)` → `makeWASocket({...})` → wire `connection.update` → `handleConnectionUpdate` → emit `"connection"` events.

## Public API

### WhatsAppEngine

```ts
class WhatsAppEngine extends EventEmitter {
  constructor(config: WhatsAppEngineConfig)
  registerAdapter(adapter: IDatabaseAdapter): void
  hasAdapter(): boolean
  connect(name: string): Promise<void>
  disconnect(name: string): Promise<void>
  stop(): Promise<void>
  requestPairingCode(name: string, phoneNumber: string): Promise<string>
  sendText(name: string, chatId: string, text: string): Promise<SendResult>
  sendMedia(name: string, chatId: string, media: MediaInput): Promise<SendResult>
  sendChatState(name: string, chatId: string, state: ChatState): Promise<void>
  getStatus(name: string): string | undefined
  getQR(name: string): string | null
  getPairingCode(name: string): string | null
  listSessions(): string[]
  on<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this
  once<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this
}
```

### SessionManager

```ts
class SessionManager {
  create(name: string): SessionInfo
  get(name: string): SessionInfo | undefined
  has(name: string): boolean
  destroy(name: string): boolean
  status(name: string): SessionStatus | undefined
  setStatus(name: string, status: SessionStatus): void
  setSocket(name: string, socket: WASocket | null): void
  setQR(name: string, qr: string | null): void
  setPairingCode(name: string, code: string | null): void
  setAccountInfo(name: string, phone: string | null, pushName: string | null): void
  incrementReconnectAttempts(name: string): number
  resetReconnectAttempts(name: string): void
  setReconnectTimer(name: string, timer: NodeJS.Timeout | null): void
  clearReconnectTimer(name: string): void
  markIntentionalClose(name: string): void
  clearIntentionalClose(name: string): void
  setConnecting(name: string, value: boolean): void
  list(): string[]
  count(): number
}
```

### Exported utilities

```ts
// anti-ban/typing.ts
simulateTyping(textLength: number, maxMs?: number): Promise<void>
simulateTypingDelay(textLength: number, maxMs?: number): number

// anti-ban/throttling.ts
createThrottle(baseDelay?: number, jitterMax?: number): Throttle
// Throttle.wait(): Promise<void>

// lid/resolver.ts
normalizeJid(jid: string): string
isLidJid(jid: string): boolean
resolveDeliverableJid(jid: string, lidMap: Map<string, string>): string

// normalizer.ts
normalizeIncomingMessage(msg: WAMessage, lidMap?: Map<string, string>): IncomingMessage
normalizeSentResult(result: any, _jid: string): SendResult
detectMessageType(msg: WAMessage): MessageType
unwrapViewOnce(msg: WAMessage): WAMessage

// retry/store.ts
createMessageStore(maxSize?: number): MessageStore
// MessageStore.set(key, message), .get(key), .clear(), .size()

// reconnect/backoff.ts
calculateBackoffDelay(attempts: number): number
isTerminalError(statusCode: number | undefined): boolean
classifyDisconnect(statusCode: number | undefined): "terminal" | "transient" | "unknown"
```

### Types

```ts
// config.ts
WhatsAppEngineConfig { authDir, browser?, markOnlineOnConnect?, simulateTyping?, simulateTypingMaxMs?, delayBetweenMessages?, randomizeDelay?, messageStoreCap?, logLevel?, mediaMaxSize? }
ChatState = "typing" | "recording" | "paused"

// messages.ts
MessageType = "text" | "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contact" | "poll" | "reaction" | "revoked" | "ephemeral" | "unknown"
IncomingMessage = NormalizedMessage  // alias
NormalizedMessage { id, from, to, chatId, body, type, timestamp, fromMe, isGroup, media?, location?, quotedMessage?, ephemeralDuration?, isLidSender?, senderPhone?, viewOnce? }
SendResult { id, timestamp }
MediaInput { mimetype, data, filename?, caption?, mentions?, ptt? }
MediaPayload { mimetype, filename?, data?, omitted?, sizeBytes? }
LocationPayload { latitude, longitude, description?, address?, url? }
QuotedMessage { id, body }

// events.ts
ConnectionStatus = "initializing" | "qr" | "pairing_code" | "connecting" | "connected" | "disconnected" | "reconnecting" | "logged_out" | "failed"
ConnectionEvent { sessionName, status, qr?, pairingCode?, phone?, pushName?, reason? }
MessageEvent { sessionName, message: IncomingMessage }
EngineEventMap { connection: [ConnectionEvent]; message: [MessageEvent]; "message:create": [MessageEvent]; "message:ack": [messageId: string, status: string]; "message:revoked": [{ id, revokedId?, chatId, from, to, timestamp }]; "message:reaction": [{ messageId, chatId, reaction, senderId }]; error: [{ sessionName, error }] }

// adapter.ts
IDatabaseAdapter { getSession, upsertSession, deleteSession, getMessage, putMessage, clearSessionMessages, getLidMapping, upsertLidMapping, listContacts, upsertContact, listChats, upsertChat }
SessionRecord { name, status, phone?, pushName?, createdAt?, updatedAt? }
StoredMessage { keyId, message, timestamp? }
ContactRecord { id, name?, pushName?, number?, isMyContact?, isBlocked? }
ChatRecord { id, name?, phoneJid?, unreadCount?, lastMessageTimestamp? }
```

## Patterns

### Standard setup

```ts
const engine = new WhatsAppEngine({ authDir: "./auth" });
const adapter = new SQLiteAdapter({ filePath: "./data.db" });
await adapter.initialize();
engine.registerAdapter(adapter);

engine.on("connection", handleConnection);
engine.on("message", handleMessage);

await engine.connect("main");
```

### Message handler pattern

```ts
engine.on("message", ({ sessionName, message }) => {
  // Drop messages from self
  if (message.fromMe) return;

  // Type dispatch
  switch (message.type) {
    case "text":
      handleText(message);
      break;
    case "image":
      handleImage(message);
      break;
    case "location":
      handleLocation(message);
      break;
  }
});
```

### JID conventions for chatId

- **Direct chat**: `5215551234567@c.us`
- **Group chat**: `123456789@g.us`
- **LID user** (privacy, phone unknown): `abc123@lid`

Always use the neutral dialect (`@c.us`, `@g.us`, `@lid`). Never use `@s.whatsapp.net`.

### Bulk send pattern

```ts
const throttle = createThrottle(3000, 2000);
for (const recipient of recipients) {
  await throttle.wait();
  await engine.sendText("bot-1", recipient, message);
}
```

## Gotchas

1. **Adapter must be registered before `connect()`**. Calling `connect()` without registering an adapter throws `"Database adapter not registered"`.

2. **`sendText` requires session status === `"connected"`**. If the session is `"initializing"`, `"qr"`, or `"pairing_code"`, it throws `"Session not connected"`.

3. **Chat IDs must include the suffix**. `"5215551234567@c.us"`, NOT `"5215551234567"`. The framework does not auto-append domain suffixes.

4. **Phone number for `requestPairingCode` must be in international format** (`+5215551234567`), NOT the JID format. Regex validation: `/^\+[1-9]\d{7,14}$/`.

5. **`connect()` is idempotent but not queueing**. Calling `connect()` while a previous `connect()` is still in flight returns immediately (no-op). You cannot call it again from within the process — wait for the `"connected"` event before using the session.

6. **Auth files are in `authDir/<sessionName>/`**. Each session gets its own subdirectory. Do not share auth directories across sessions with the same name — each session needs unique credentials.

7. **Media size validation happens before sending**. If `data.length > mediaMaxSize`, `sendMedia()` throws `"Media exceeds size cap"`. Set `mediaMaxSize` in config to adjust (default 50 MB).

8. **`stop()` removes all listeners**. After calling `stop()`, the engine is effectively unusable. Create a new instance if you need to restart.

9. **SQLite adapter wraps synchronous calls in `Promise.resolve()`**. This means errors thrown synchronously by `better-sqlite3` become *unhandled promise rejections*, not caught rejections. Always `try/catch` around adapter initialization.

10. **Reconnection is automatic for transient errors, terminal for 401/403/440**. If a session receives a 401, the auth directory is deleted. A new `connect()` will generate a fresh QR code.

11. **`simulateTyping` only applies to `sendText()`**. `sendMedia()` does not simulate typing. You can manually call `engine.sendChatState(name, chatId, "typing")` before sending media if needed.

12. **Messages stored in the retry ring buffer are lost on process restart**. The SQLite/MySQL/Postgres adapter persists them to disk — use an adapter for production.

13. **The `message` field in `StoredMessage` is stored as JSON**. When retrieving via a database adapter, the field is `JSON.parse()`'d. The raw Baileys `WAMessage` protobuf shape is preserved for retry compatibility.

## Testing

```bash
# Run all tests (vitest)
npm test

# Watch mode
npm run test:watch

# Type checking only
npm run typecheck
```

Tests use vitest with in-memory SQLite via `better-sqlite3`. Test files are in `test/`. No external database required for the test suite.
