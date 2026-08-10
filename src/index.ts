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
export { SessionManager } from "./session.js";
export * from "./types/index.js";
