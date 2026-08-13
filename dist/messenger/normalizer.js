function attachmentTypeToMimetype(type) {
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
function detectType(msg) {
    if (!msg.attachments || msg.attachments.length === 0)
        return "text";
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
function extractMedia(msg) {
    if (!msg.attachments || msg.attachments.length === 0)
        return undefined;
    const first = msg.attachments[0];
    return {
        mimetype: attachmentTypeToMimetype(first.type),
        filename: first.filename || first.name || undefined,
    };
}
function extractQuotedMessage(msg) {
    if (!msg.messageReply)
        return undefined;
    return {
        id: msg.messageReply.messageID,
        body: msg.messageReply.body || "",
    };
}
export function normalizeMessengerMessage(msg, currentUserID) {
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
//# sourceMappingURL=normalizer.js.map