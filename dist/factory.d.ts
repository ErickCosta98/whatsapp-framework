import { WhatsAppEngine } from "./engine.js";
import { MessengerEngine } from "./messenger/engine.js";
import type { WhatsAppEngineConfig, MessengerEngineConfig } from "./types/index.js";
export type Platform = "whatsapp" | "messenger";
/**
 * Factory function to create the appropriate engine for a given platform.
 *
 * Uses function overloads to provide discriminated union type narrowing:
 * - `createEngine("whatsapp", config)` returns `WhatsAppEngine`
 * - `createEngine("messenger", config)` returns `MessengerEngine`
 *
 * @throws `"Unsupported platform: <platform>"` for unknown platforms.
 */
export declare function createEngine(platform: "whatsapp", config: WhatsAppEngineConfig): WhatsAppEngine;
export declare function createEngine(platform: "messenger", config: MessengerEngineConfig): MessengerEngine;
//# sourceMappingURL=factory.d.ts.map