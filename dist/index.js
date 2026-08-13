/**
 * @gentle/whatsapp-framework
 *
 * Unified WhatsApp engine built on Baileys with multi-session support,
 * anti-ban protections, database abstraction, and message normalization.
 *
 * Public API:
 *   - WhatsAppEngine — core engine class
 *   - IDatabaseAdapter — database adapter interface
 *   - Types — IncomingMessage, SendResult, ConnectionEvent, etc.
 *
 * Sub-path exports:
 *   - `@gentle/whatsapp-framework/mysql` — MySQL adapter
 *   - `@gentle/whatsapp-framework/postgres` — PostgreSQL adapter
 */
export { WhatsAppEngine } from "./engine.js";
export { MessengerEngine } from "./messenger/engine.js";
export { createEngine } from "./factory.js";
export { SessionManager } from "./session.js";
export * from "./types/index.js";
export * from "./anti-ban/typing.js";
export * from "./anti-ban/throttling.js";
export * from "./lid/resolver.js";
export * from "./retry/store.js";
export * from "./normalizer.js";
export { normalizeMessengerMessage } from "./messenger/normalizer.js";
export { bufferToReadStream } from "./messenger/media-converter.js";
//# sourceMappingURL=index.js.map