import { describe, it, expect } from "vitest";
import type { WAMessage, proto } from "@whiskeysockets/baileys";
import {
  detectMessageType,
  unwrapViewOnce,
  normalizeIncomingMessage,
  normalizeSentResult,
} from "../src/normalizer.js";
import type { MessageType } from "../src/types/messages.js";

/* ─── Helpers to build fake Baileys messages ─── */

function makeMessage(
  content: proto.IMessage,
  overrides?: Partial<WAMessage>,
): WAMessage {
  return {
    key: {
      id: "msg-id",
      remoteJid: "1234567890@s.whatsapp.net",
      fromMe: false,
      participant: undefined,
    },
    messageTimestamp: 1_700_000_000,
    pushName: "Test",
    message: content,
    ...overrides,
  } as WAMessage;
}

/* ─── detectMessageType ─── */

describe("normalizer / detectMessageType", () => {
  it("detects text (conversation)", () => {
    const msg = makeMessage({ conversation: "hello" });
    expect(detectMessageType(msg)).toBe("text");
  });

  it("detects text (extendedTextMessage)", () => {
    const msg = makeMessage({ extendedTextMessage: { text: "hi there" } });
    expect(detectMessageType(msg)).toBe("text");
  });

  it("detects image", () => {
    const msg = makeMessage({ imageMessage: { mimetype: "image/jpeg" } });
    expect(detectMessageType(msg)).toBe("image");
  });

  it("detects video", () => {
    const msg = makeMessage({ videoMessage: { mimetype: "video/mp4" } });
    expect(detectMessageType(msg)).toBe("video");
  });

  it("detects audio", () => {
    const msg = makeMessage({ audioMessage: { mimetype: "audio/mp3", ptt: false } });
    expect(detectMessageType(msg)).toBe("audio");
  });

  it("detects voice (ptt: true)", () => {
    const msg = makeMessage({ audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } });
    expect(detectMessageType(msg)).toBe("voice");
  });

  it("detects document", () => {
    const msg = makeMessage({ documentMessage: { mimetype: "application/pdf" } });
    expect(detectMessageType(msg)).toBe("document");
  });

  it("detects sticker", () => {
    const msg = makeMessage({ stickerMessage: { mimetype: "image/webp" } });
    expect(detectMessageType(msg)).toBe("sticker");
  });

  it("detects location", () => {
    const msg = makeMessage({ locationMessage: { degreesLatitude: 10, degreesLongitude: 20 } });
    expect(detectMessageType(msg)).toBe("location");
  });

  it("detects contact", () => {
    const msg = makeMessage({ contactMessage: { displayName: "Alice" } });
    expect(detectMessageType(msg)).toBe("contact");
  });

  it("detects poll", () => {
    const msg = makeMessage({ pollCreationMessage: { name: "Q1" } });
    expect(detectMessageType(msg)).toBe("poll");
  });

  it("detects reaction", () => {
    const msg = makeMessage({ reactionMessage: { text: "👍" } });
    expect(detectMessageType(msg)).toBe("reaction");
  });

  it("detects ephemeral wrapper", () => {
    const msg = makeMessage({
      ephemeralMessage: {
        message: { conversation: "secret" },
      },
    });
    expect(detectMessageType(msg)).toBe("ephemeral");
  });

  it("returns unknown for unrecognised content", () => {
    const msg = makeMessage({ eventMessage: { name: "party" } });
    expect(detectMessageType(msg)).toBe("unknown");
  });

  it("returns unknown when message is missing", () => {
    const msg = makeMessage({});
    (msg as any).message = undefined;
    expect(detectMessageType(msg)).toBe("unknown");
  });
});

/* ─── unwrapViewOnce ─── */

describe("normalizer / unwrapViewOnce", () => {
  it("unwraps viewOnceMessage to inner content", () => {
    const inner = { conversation: "secret pic" };
    const msg = makeMessage({
      viewOnceMessage: { message: inner },
    });
    const unwrapped = unwrapViewOnce(msg);
    expect((unwrapped.message as proto.IMessage).conversation).toBe("secret pic");
  });

  it("unwraps ephemeralMessage to inner content", () => {
    const inner = { imageMessage: { mimetype: "image/png" } };
    const msg = makeMessage({
      ephemeralMessage: { message: inner },
    });
    const unwrapped = unwrapViewOnce(msg);
    expect((unwrapped.message as proto.IMessage).imageMessage).toBeDefined();
  });

  it("returns original message when no wrapper present", () => {
    const msg = makeMessage({ conversation: "plain" });
    const unwrapped = unwrapViewOnce(msg);
    expect(unwrapped).toBe(msg);
  });
});

/* ─── normalizeIncomingMessage ─── */

describe("normalizer / normalizeIncomingMessage", () => {
  it("normalizes a text DM", () => {
    const msg = makeMessage({ conversation: "hello world" });
    const normalized = normalizeIncomingMessage(msg);

    expect(normalized.id).toBe("msg-id");
    expect(normalized.from).toBe("1234567890@c.us");
    expect(normalized.chatId).toBe("1234567890@c.us");
    expect(normalized.body).toBe("hello world");
    expect(normalized.type).toBe("text");
    expect(normalized.fromMe).toBe(false);
    expect(normalized.isGroup).toBe(false);
    expect(normalized.timestamp).toBe(1_700_000_000);
    expect(normalized.isLidSender).toBe(false);
    expect(normalized.senderPhone).toBeNull();
  });

  it("normalizes a sent message (fromMe=true)", () => {
    const msg = makeMessage(
      { conversation: "outbound" },
      { key: { id: "out", remoteJid: "5559999@s.whatsapp.net", fromMe: true, participant: undefined } },
    );
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.from).toBe("5559999@c.us");
    expect(normalized.to).toBe("5559999@c.us");
    expect(normalized.fromMe).toBe(true);
  });

  it("normalizes a group message with participant", () => {
    const msg = makeMessage(
      { conversation: "group hi" },
      {
        key: {
          id: "g1",
          remoteJid: "group@g.us",
          fromMe: false,
          participant: "5551111@s.whatsapp.net",
        },
      },
    );
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.chatId).toBe("group@g.us");
    expect(normalized.from).toBe("5551111@c.us");
    expect(normalized.isGroup).toBe(true);
  });

  it("detects LID sender and resolves phone via lidMap", () => {
    const msg = makeMessage(
      { conversation: "lid msg" },
      {
        key: {
          id: "lid1",
          remoteJid: "liduser@lid",
          fromMe: false,
          participant: undefined,
        },
      },
    );
    const map = new Map([["liduser@lid", "5550000"]]);
    const normalized = normalizeIncomingMessage(msg, map);
    expect(normalized.isLidSender).toBe(true);
    expect(normalized.senderPhone).toBe("5550000");
  });

  it("preserves unmapped LID sender", () => {
    const msg = makeMessage(
      { conversation: "lid unknown" },
      {
        key: {
          id: "lid2",
          remoteJid: "unknown@lid",
          fromMe: false,
          participant: undefined,
        },
      },
    );
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.isLidSender).toBe(true);
    expect(normalized.senderPhone).toBeNull();
  });

  it("unwraps viewOnce and sets the viewOnce flag", () => {
    const msg = makeMessage({
      viewOnceMessage: {
        message: { imageMessage: { mimetype: "image/jpeg", caption: "view" } },
      },
    });
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.type).toBe("image");
    expect(normalized.viewOnce).toBe(true);
    expect(normalized.body).toBe("view");
    expect(normalized.media).toBeDefined();
    expect(normalized.media?.mimetype).toBe("image/jpeg");
  });

  it("extracts media metadata for image messages", () => {
    const msg = makeMessage({
      imageMessage: {
        mimetype: "image/png",
        fileName: "pic.png",
        fileLength: 1234,
      },
    });
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.media).toEqual({
      mimetype: "image/png",
      filename: "pic.png",
      omitted: false,
      sizeBytes: 1234,
    });
  });

  it("extracts location payload", () => {
    const msg = makeMessage({
      locationMessage: {
        degreesLatitude: 19.43,
        degreesLongitude: -99.13,
        name: "CDMX",
        address: "Some street",
        url: "https://maps.example.com",
      },
    });
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.location).toEqual({
      latitude: 19.43,
      longitude: -99.13,
      description: "CDMX",
      address: "Some street",
      url: "https://maps.example.com",
    });
  });

  it("extracts quoted message", () => {
    const msg = makeMessage({
      extendedTextMessage: {
        text: "reply",
        contextInfo: {
          stanzaId: "quoted-id",
          quotedMessage: { conversation: "original" },
        },
      },
    });
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.quotedMessage).toEqual({
      id: "quoted-id",
      body: "original",
    });
  });

  it("handles empty message gracefully", () => {
    const msg = makeMessage({});
    (msg as any).message = undefined;
    const normalized = normalizeIncomingMessage(msg);
    expect(normalized.type).toBe("unknown");
    expect(normalized.body).toBe("");
    expect(normalized.media).toBeUndefined();
  });
});

/* ─── normalizeSentResult ─── */

describe("normalizer / normalizeSentResult", () => {
  it("extracts id and timestamp from a Baileys result", () => {
    const result = {
      key: { id: "sent-1", remoteJid: "123@c.us" },
      messageTimestamp: 1_700_000_001,
    };
    const normalized = normalizeSentResult(result, "123@c.us");
    expect(normalized.id).toBe("sent-1");
    expect(normalized.timestamp).toBe(1_700_000_001);
  });

  it("falls back to Date.now when timestamp is missing", () => {
    const result = { key: { id: "sent-2" } };
    const before = Date.now();
    const normalized = normalizeSentResult(result, "123@c.us");
    const after = Date.now();
    expect(normalized.id).toBe("sent-2");
    expect(normalized.timestamp).toBeGreaterThanOrEqual(before);
    expect(normalized.timestamp).toBeLessThanOrEqual(after);
  });

  it("falls back to empty id when key is missing", () => {
    const result = {};
    const normalized = normalizeSentResult(result, "123@c.us");
    expect(normalized.id).toBe("");
    expect(normalized.timestamp).toBeGreaterThanOrEqual(0);
  });
});
