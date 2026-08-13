import { describe, it, expect } from "vitest";
import { normalizeMessengerMessage } from "../../src/messenger/normalizer.js";

function makeMessage(overrides: Record<string, any> = {}): any {
  return {
    type: "message",
    senderID: "100",
    body: "hello",
    threadID: "200",
    messageID: "m1",
    attachments: [],
    mentions: {},
    timestamp: "1690000000000",
    isGroup: false,
    ...overrides,
  };
}

describe("messenger / normalizer", () => {
  it("normalizes a plain text message", () => {
    const msg = makeMessage();
    const result = normalizeMessengerMessage(msg, "me");
    expect(result).toEqual({
      id: "m1",
      from: "100",
      to: "200",
      chatId: "200",
      body: "hello",
      type: "text",
      timestamp: 1690000000000,
      fromMe: false,
      isGroup: false,
      viewOnce: false,
      ephemeralDuration: undefined,
      isLidSender: false,
      senderPhone: null,
      pushName: null,
    });
  });

  it("computes fromMe when sender matches current user", () => {
    const msg = makeMessage({ senderID: "me" });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.fromMe).toBe(true);
  });

  it("maps photo attachment to image media", () => {
    const msg = makeMessage({
      attachments: [{ type: "photo", ID: "p1", filename: "pic.jpg" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("image");
    expect(result.media).toEqual({
      mimetype: "image/jpeg",
      filename: "pic.jpg",
    });
  });

  it("maps video attachment to video media", () => {
    const msg = makeMessage({
      attachments: [{ type: "video", ID: "v1", filename: "vid.mp4" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("video");
    expect(result.media?.mimetype).toBe("video/mp4");
  });

  it("maps audio attachment to audio media", () => {
    const msg = makeMessage({
      attachments: [{ type: "audio", ID: "a1", filename: "snd.mp3" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("audio");
    expect(result.media?.mimetype).toBe("audio/mpeg");
  });

  it("maps file attachment to document media", () => {
    const msg = makeMessage({
      attachments: [{ type: "file", ID: "f1", filename: "doc.pdf" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("document");
    expect(result.media?.mimetype).toBe("application/octet-stream");
  });

  it("maps sticker attachment to sticker media", () => {
    const msg = makeMessage({
      attachments: [{ type: "sticker", ID: "s1", filename: "stk.webp" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("sticker");
    expect(result.media?.mimetype).toBe("image/webp");
  });

  it("maps unknown attachment to unknown type", () => {
    const msg = makeMessage({
      attachments: [{ type: "share", ID: "sh1" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.type).toBe("unknown");
    expect(result.media?.mimetype).toBe("application/octet-stream");
  });

  it("extracts quoted message", () => {
    const msg = makeMessage({
      messageReply: {
        messageID: "r1",
        senderID: "100",
        body: "previous",
        attachments: [],
        timestamp: "1690000000001",
        isReply: true,
      },
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.quotedMessage).toEqual({ id: "r1", body: "previous" });
  });

  it("marks isGroup correctly", () => {
    const msg = makeMessage({ isGroup: true });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.isGroup).toBe(true);
  });

  it("uses name as filename fallback", () => {
    const msg = makeMessage({
      attachments: [{ type: "photo", ID: "p2", name: "pic2.png" }],
    });
    const result = normalizeMessengerMessage(msg, "me");
    expect(result.media?.filename).toBe("pic2.png");
  });
});
