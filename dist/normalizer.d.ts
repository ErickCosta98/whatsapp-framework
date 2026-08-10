/**
 * Message normalization pipeline.
 *
 * Converts raw Baileys `WAMessage` objects into the framework's neutral
 * `IncomingMessage` shape. Handles ephemeral / view-once unwrapping,
 * message type detection, JID normalization, and LID resolution.
 */
import { type WAMessage } from "@whiskeysockets/baileys";
import type { IncomingMessage, MessageType, SendResult } from "./types/messages.js";
/** Default media size cap in bytes (50 MB). */
export declare const DEFAULT_MEDIA_CAP_BYTES: number;
/**
 * Detect the message type from raw Baileys content.
 *
 * Checks the unwrapped message content and maps Baileys content keys to the
 * framework's `MessageType` union. Distinguishes voice notes (`ptt: true`)
 * from regular audio.
 *
 * @param msg — raw Baileys WAMessage
 * @returns detected MessageType
 */
export declare function detectMessageType(msg: WAMessage): MessageType;
/**
 * Unwrap view-once / ephemeral wrappers to expose the inner message content.
 *
 * Returns a shallow copy of the original message with `message` replaced by
 * the unwrapped content. If no wrapper is present, returns the original
 * message unchanged.
 *
 * @param msg — raw Baileys WAMessage
 * @returns WAMessage with unwrapped content
 */
export declare function unwrapViewOnce(msg: WAMessage): WAMessage;
/**
 * Normalize an inbound Baileys message into the framework's `IncomingMessage`.
 *
 * Pipeline: unwrap ephemeral/viewOnce → detect type → resolve sender JID →
 * build normalized shape.
 *
 * @param msg — raw Baileys WAMessage
 * @param lidMap — optional LID → phone lookup table
 * @returns fully normalized IncomingMessage
 */
export declare function normalizeIncomingMessage(msg: WAMessage, lidMap?: Map<string, string>): IncomingMessage;
/**
 * Normalize a Baileys send result into the framework's `SendResult`.
 *
 * @param result — raw Baileys send result (any shape)
 * @param _jid — target JID (reserved for future validation)
 * @returns normalized SendResult
 */
export declare function normalizeSentResult(result: any, _jid: string): SendResult;
//# sourceMappingURL=normalizer.d.ts.map