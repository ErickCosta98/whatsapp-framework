import type { IncomingMessage } from "../types/messages.js";
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
export declare function normalizeMessengerMessage(msg: MessengerMessage, currentUserID: string): IncomingMessage;
export {};
//# sourceMappingURL=normalizer.d.ts.map