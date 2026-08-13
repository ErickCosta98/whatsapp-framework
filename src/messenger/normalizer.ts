import type { IncomingMessage, MediaPayload, QuotedMessage } from "../types/messages.js";

interface MessengerAttachment {
  type: string;
  filename?: string;
  url?: string;
  name?: string;
}

interface MessengerMessageReply {
  messageID: string;
  senderID: string;
  body: string;
  attachments?: MessengerAttachment[];
  timestamp: string;
  isReply: boolean;
}

interface MessengerMessage {
  type: string;
  senderID: string;
  body: string;
  threadID: string;
  messageID: string;
  attachments: MessengerAttachment[];
  mentions: Record<string, string>;
  timestamp: string;
  isGroup: boolean;
  participantIDs?: string[];
  messageReply?: MessengerMessageReply;
}

function attachmentTypeToMimetype(type: string): string {
  switch (type) {
    case "photo":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/mpeg";
    case "file":
      return "application/octet-stream";
    case "sticker":
      return "image/webp";
    case "location":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function detectType(msg: MessengerMessage): import("../types/messages.js").MessageType {
  if (!msg.attachments || msg.attachments.length === 0) return "text";
  const first = msg.attachments[0];
  switch (first.type) {
    case "photo":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "file":
      return "document";
    case "sticker":
      return "sticker";
    case "location":
      return "location";
    default:
      return "unknown";
  }
}

function extractMedia(msg: MessengerMessage): MediaPayload | undefined {
  if (!msg.attachments || msg.attachments.length === 0) return undefined;
  const first = msg.attachments[0];
  return {
    mimetype: attachmentTypeToMimetype(first.type),
    filename: first.filename || first.name || undefined,
  };
}

function extractQuotedMessage(msg: MessengerMessage): QuotedMessage | undefined {
  if (!msg.messageReply) return undefined;
  return {
    id: msg.messageReply.messageID,
    body: msg.messageReply.body || "",
  };
}

export function normalizeMessengerMessage(
  msg: MessengerMessage,
  currentUserID: string,
): IncomingMessage {
  const fromMe = msg.senderID === currentUserID;
  return {
    id: msg.messageID,
    from: msg.senderID,
    to: msg.threadID,
    chatId: msg.threadID,
    body: msg.body || "",
    type: detectType(msg),
    timestamp: Number(msg.timestamp),
    fromMe,
    isGroup: !!msg.isGroup,
    media: extractMedia(msg),
    quotedMessage: extractQuotedMessage(msg),
    viewOnce: false,
    ephemeralDuration: undefined,
    isLidSender: false,
    senderPhone: null,
    pushName: null,
  };
}
