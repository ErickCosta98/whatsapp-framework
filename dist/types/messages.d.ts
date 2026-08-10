/**
 * Message type definitions for the public API.
 *
 * All JIDs emitted in public API fields (`from`, `to`, `chatId`, etc.)
 * use the neutral dialect:
 *   - `<phone>@c.us`     a user known by phone
 *   - `<id>@g.us`        a group
 *   - `<lid>@lid`        a privacy-id user (phone genuinely unknown)
 *
 * Never `@s.whatsapp.net`, never `:device` suffix.
 */
export type MessageType = "text" | "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contact" | "poll" | "reaction" | "revoked" | "ephemeral" | "unknown";
export interface MediaPayload {
    mimetype: string;
    filename?: string;
    data?: string;
    /** True when the media blob was dropped due to a size cap or timeout. */
    omitted?: boolean;
    /** Decoded byte size; always set when `omitted` is true. */
    sizeBytes?: number;
}
export interface LocationPayload {
    latitude: number;
    longitude: number;
    description?: string;
    address?: string;
    url?: string;
}
export interface QuotedMessage {
    id: string;
    body: string;
}
export interface NormalizedMessage {
    id: string;
    from: string;
    to: string;
    chatId: string;
    body: string;
    type: MessageType;
    timestamp: number;
    fromMe: boolean;
    isGroup: boolean;
    media?: MediaPayload;
    location?: LocationPayload;
    quotedMessage?: QuotedMessage;
    ephemeralDuration?: number;
    isLidSender?: boolean;
    senderPhone?: string | null;
    /** Sender's WhatsApp profile name (Baileys pushName). */
    pushName?: string | null;
    viewOnce?: boolean;
}
/**
 * Incoming message — same shape as NormalizedMessage.
 * Kept as a separate alias for semantic clarity in the public API.
 */
export type IncomingMessage = NormalizedMessage;
export interface SendResult {
    id: string;
    timestamp: number;
}
export interface MediaInput {
    mimetype: string;
    data: Buffer | string;
    filename?: string;
    caption?: string;
    mentions?: string[];
    /** Send as voice note (PTT). Audio-only; ignored by other types. */
    ptt?: boolean;
}
//# sourceMappingURL=messages.d.ts.map