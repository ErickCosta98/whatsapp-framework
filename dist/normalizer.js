/**
 * Message normalization pipeline.
 *
 * Converts raw Baileys `WAMessage` objects into the framework's neutral
 * `IncomingMessage` shape. Handles ephemeral / view-once unwrapping,
 * message type detection, JID normalization, and LID resolution.
 */
import { extractMessageContent, getContentType, } from "@whiskeysockets/baileys";
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
export function detectMessageType(msg) {
    const raw = msg.message;
    if (!raw)
        return "unknown";
    // Check for wrappers before unwrapping so we can report them explicitly
    const rawType = getContentType(raw);
    if (rawType === "ephemeralMessage")
        return "ephemeral";
    const content = extractMessageContent(raw);
    if (!content)
        return "unknown";
    const type = getContentType(content);
    if (!type)
        return "unknown";
    switch (type) {
        case "conversation":
        case "extendedTextMessage":
            return "text";
        case "imageMessage":
            return "image";
        case "videoMessage":
            return "video";
        case "audioMessage": {
            const audio = content.audioMessage;
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
export function unwrapViewOnce(msg) {
    const unwrapped = extractMessageContent(msg.message);
    if (!unwrapped || unwrapped === msg.message) {
        return msg;
    }
    return { ...msg, message: unwrapped };
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
export function normalizeIncomingMessage(msg, lidMap) {
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
    let senderPhone = null;
    if (isLidSender && lidMap) {
        senderPhone = lidMap.get(from) ?? null;
    }
    const pushName = msg.pushName ?? null;
    const timestamp = typeof unwrapped.messageTimestamp === "number"
        ? unwrapped.messageTimestamp
        : Number(unwrapped.messageTimestamp ?? 0);
    const body = extractBody(unwrapped, type);
    const media = extractMedia(unwrapped, type);
    const location = extractLocation(unwrapped, type);
    const quotedMessage = extractQuotedMessage(unwrapped);
    const ephemeralDuration = msg.message?.ephemeralMessage
        ? extractEphemeralDuration(msg)
        : undefined;
    const viewOnce = !!(msg.message?.viewOnceMessage ||
        msg.message?.viewOnceMessageV2 ||
        msg.message?.viewOnceMessageV2Extension);
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
export function normalizeSentResult(result, _jid) {
    const id = result?.key?.id ?? result?.id ?? "";
    const timestamp = result?.messageTimestamp
        ? Number(result.messageTimestamp)
        : Date.now();
    return { id, timestamp };
}
/* ─── Private helpers ─── */
function extractBody(msg, type) {
    const content = msg.message;
    if (!content)
        return "";
    switch (type) {
        case "text": {
            const c = content;
            return (c.conversation ??
                c.extendedTextMessage?.text ??
                "");
        }
        case "image":
        case "video":
        case "audio":
        case "voice":
        case "document": {
            const mediaContent = content;
            const mediaMsg = mediaContent.imageMessage ??
                mediaContent.videoMessage ??
                mediaContent.audioMessage ??
                mediaContent.documentMessage;
            return mediaMsg?.caption ?? "";
        }
        case "reaction": {
            const r = content;
            return r.reactionMessage?.text ?? "";
        }
        default:
            return "";
    }
}
function extractMedia(msg, type) {
    const content = msg.message;
    if (!content)
        return undefined;
    let mediaMsg;
    switch (type) {
        case "image":
            mediaMsg = content.imageMessage;
            break;
        case "video":
            mediaMsg = content.videoMessage;
            break;
        case "audio":
        case "voice":
            mediaMsg = content.audioMessage;
            break;
        case "document":
            mediaMsg = content.documentMessage;
            break;
        case "sticker":
            mediaMsg = content.stickerMessage;
            break;
        default:
            return undefined;
    }
    if (!mediaMsg)
        return undefined;
    const mimetype = mediaMsg.mimetype ?? "";
    const filename = mediaMsg.fileName ?? undefined;
    const fileLength = typeof mediaMsg.fileLength === "number"
        ? mediaMsg.fileLength
        : Number(mediaMsg.fileLength ?? 0);
    return {
        mimetype,
        filename,
        omitted: false,
        sizeBytes: fileLength,
    };
}
function extractLocation(msg, type) {
    const content = msg.message;
    if (!content || type !== "location")
        return undefined;
    const loc = content.locationMessage;
    if (!loc)
        return undefined;
    return {
        latitude: loc.degreesLatitude ?? 0,
        longitude: loc.degreesLongitude ?? 0,
        description: loc.name ?? undefined,
        address: loc.address ?? undefined,
        url: loc.url ?? undefined,
    };
}
function extractQuotedMessage(msg) {
    const content = msg.message;
    const ctx = content?.extendedTextMessage?.contextInfo;
    if (!ctx)
        return undefined;
    const quotedId = ctx.stanzaId ?? "";
    const quotedBody = ctx.quotedMessage
        ? extractMessageContent(ctx.quotedMessage)
            ?.conversation ??
            extractMessageContent(ctx.quotedMessage)
                ?.extendedTextMessage?.text ??
            ""
        : "";
    if (!quotedId && !quotedBody)
        return undefined;
    return { id: quotedId, body: quotedBody };
}
function extractEphemeralDuration(_msg) {
    // Baileys does not expose ephemeral duration on the message directly;
    // it lives in chat settings. Return undefined unless we can infer it.
    return undefined;
}
//# sourceMappingURL=normalizer.js.map