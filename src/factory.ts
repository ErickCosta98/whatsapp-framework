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
export function createEngine(platform: "whatsapp", config: WhatsAppEngineConfig): WhatsAppEngine;
export function createEngine(platform: "messenger", config: MessengerEngineConfig): MessengerEngine;
export function createEngine(
  platform: Platform,
  config: WhatsAppEngineConfig | MessengerEngineConfig,
): WhatsAppEngine | MessengerEngine {
  if (platform === "whatsapp") {
    return new WhatsAppEngine(config as WhatsAppEngineConfig);
  }
  if (platform === "messenger") {
    return new MessengerEngine(config as MessengerEngineConfig);
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
