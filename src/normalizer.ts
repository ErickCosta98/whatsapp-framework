/**
 * Message normalization pipeline.
 *
 * Converts raw Baileys `WAMessage` objects into the framework's neutral
 * `IncomingMessage` shape. Handles ephemeral / view-once unwrapping,
 * message type detection, JID normalization, and LID resolution.
 */

import {
  type WAMessage,
  extractMessageContent,
  getContentType,
  type proto,
} from "@whiskeysockets/baileys";

import type { IncomingMessage, MessageType, SendResult } from "./types/messages.js";
import { normalizeJid } from "./lid/resolver.js";

/** Default media size cap in bytes (50 MB). */
export const DEFAULT_MEDIA_CAP_BYTES = 50 * 1024 * 1024;

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
export function detectMessageType(msg: WAMessage): MessageType {
  const raw = msg.message;
  if (!raw) return "unknown";

  // Check for wrappers before unwrapping so we can report them explicitly
  const rawType = getContentType(raw);
  if (rawType === "ephemeralMessage") return "ephemeral";

  const content = extractMessageContent(raw);
  if (!content) return "unknown";

  const type = getContentType(content);
  if (!type) return "unknown";

  switch (type) {
    case "conversation":
    case "extendedTextMessage":
      return "text";
    case "imageMessage":
      return "image";
    case "videoMessage":
      return "video";
    case "audioMessage": {
      const audio = (content as proto.IMessage).audioMessage as
        | proto.Message.IAudioMessage
        | undefined;
      return audio?.ptt ? "voice" : "audio";
    }
    case "documentMessage":
      return "document";
    case "stickerMessage":
      return "sticker";
    case "locationMessage":
    case "liveLocationMessage":
      return "location";
    case "contactMessage":
    case "contactsArrayMessage":
      return "contact";
    case "pollCreationMessage":
    case "pollCreationMessageV2":
    case "pollCreationMessageV3":
    case "pollCreationMessageV4":
    case "pollCreationMessageV5":
      return "poll";
    case "reactionMessage":
      return "reaction";
    default:
      return "unknown";
  }
}

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
export function unwrapViewOnce(msg: WAMessage): WAMessage {
  const unwrapped = extractMessageContent(msg.message);
  if (!unwrapped || unwrapped === msg.message) {
    return msg;
  }
  return { ...msg, message: unwrapped } as WAMessage;
}

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
export function normalizeIncomingMessage(
  msg: WAMessage,
  lidMap?: Map<string, string>,
): IncomingMessage {
  const unwrapped = unwrapViewOnce(msg);
  const type = detectMessageType(unwrapped);

  const key = unwrapped.key;
  const remoteJid = key.remoteJid ?? "";
  const chatId = normalizeJid(remoteJid);
  const fromMe = key.fromMe ?? false;
  const participant = key.participant ?? undefined;

  const from = fromMe
    ? chatId
    : normalizeJid(participant || remoteJid);

  const isGroup = chatId.endsWith("@g.us");
  const isLidSender = from.endsWith("@lid");

  let senderPhone: string | null = null;
  if (isLidSender && lidMap) {
    senderPhone = lidMap.get(from) ?? null;
  }

  const pushName = msg.pushName ?? null;

  const timestamp =
    typeof unwrapped.messageTimestamp === "number"
      ? unwrapped.messageTimestamp
      : Number(unwrapped.messageTimestamp ?? 0);

  const body = extractBody(unwrapped, type);
  const media = extractMedia(unwrapped, type);
  const location = extractLocation(unwrapped, type);
  const quotedMessage = extractQuotedMessage(unwrapped);

  const ephemeralDuration = msg.message?.ephemeralMessage
    ? extractEphemeralDuration(msg)
    : undefined;

  const viewOnce = !!(
    msg.message?.viewOnceMessage ||
    msg.message?.viewOnceMessageV2 ||
    msg.message?.viewOnceMessageV2Extension
  );

  return {
    id: key.id ?? "",
    from,
    to: chatId,
    chatId,
    body,
    type,
    timestamp,
    fromMe,
    isGroup,
    media,
    location,
    quotedMessage,
    ephemeralDuration,
    isLidSender,
    senderPhone,
    pushName,
    viewOnce,
  };
}

/**
 * Normalize a Baileys send result into the framework's `SendResult`.
 *
 * @param result — raw Baileys send result (any shape)
 * @param _jid — target JID (reserved for future validation)
 * @returns normalized SendResult
 */
export function normalizeSentResult(result: any, _jid: string): SendResult {
  const id = result?.key?.id ?? result?.id ?? "";
  const timestamp = result?.messageTimestamp
    ? Number(result.messageTimestamp)
    : Date.now();
  return { id, timestamp };
}

/* ─── Private helpers ─── */

function extractBody(msg: WAMessage, type: MessageType): string {
  const content = msg.message;
  if (!content) return "";

  switch (type) {
    case "text": {
      const c = content as proto.IMessage;
      return (
        c.conversation ??
        c.extendedTextMessage?.text ??
        ""
      );
    }
    case "image":
    case "video":
    case "audio":
    case "voice":
    case "document": {
      const mediaContent = content as proto.IMessage;
      const mediaMsg =
        mediaContent.imageMessage ??
        mediaContent.videoMessage ??
        mediaContent.audioMessage ??
        mediaContent.documentMessage;
      return (mediaMsg as any)?.caption ?? "";
    }
    case "reaction": {
      const r = content as proto.IMessage;
      return r.reactionMessage?.text ?? "";
    }
    default:
      return "";
  }
}

function extractMedia(
  msg: WAMessage,
  type: MessageType,
): IncomingMessage["media"] {
  const content = msg.message;
  if (!content) return undefined;

  let mediaMsg: any;

  switch (type) {
    case "image":
      mediaMsg = (content as proto.IMessage).imageMessage;
      break;
    case "video":
      mediaMsg = (content as proto.IMessage).videoMessage;
      break;
    case "audio":
    case "voice":
      mediaMsg = (content as proto.IMessage).audioMessage;
      break;
    case "document":
      mediaMsg = (content as proto.IMessage).documentMessage;
      break;
    case "sticker":
      mediaMsg = (content as proto.IMessage).stickerMessage;
      break;
    default:
      return undefined;
  }

  if (!mediaMsg) return undefined;

  const mimetype: string = mediaMsg.mimetype ?? "";
  const filename: string | undefined = mediaMsg.fileName ?? undefined;
  const fileLength =
    typeof mediaMsg.fileLength === "number"
      ? mediaMsg.fileLength
      : Number(mediaMsg.fileLength ?? 0);

  return {
    mimetype,
    filename,
    omitted: false,
    sizeBytes: fileLength,
  };
}

function extractLocation(
  msg: WAMessage,
  type: MessageType,
): IncomingMessage["location"] {
  const content = msg.message;
  if (!content || type !== "location") return undefined;

  const loc = (content as proto.IMessage).locationMessage;
  if (!loc) return undefined;

  return {
    latitude: loc.degreesLatitude ?? 0,
    longitude: loc.degreesLongitude ?? 0,
    description: loc.name ?? undefined,
    address: loc.address ?? undefined,
    url: loc.url ?? undefined,
  };
}

function extractQuotedMessage(
  msg: WAMessage,
): IncomingMessage["quotedMessage"] {
  const content = msg.message as proto.IMessage | undefined;
  const ctx = content?.extendedTextMessage?.contextInfo;
  if (!ctx) return undefined;

  const quotedId = ctx.stanzaId ?? "";
  const quotedBody = ctx.quotedMessage
    ? (extractMessageContent(ctx.quotedMessage) as proto.IMessage)
        ?.conversation ??
      (extractMessageContent(ctx.quotedMessage) as proto.IMessage)
        ?.extendedTextMessage?.text ??
      ""
    : "";

  if (!quotedId && !quotedBody) return undefined;

  return { id: quotedId, body: quotedBody };
}

function extractEphemeralDuration(_msg: WAMessage): number | undefined {
  // Baileys does not expose ephemeral duration on the message directly;
  // it lives in chat settings. Return undefined unless we can infer it.
  return undefined;
}
