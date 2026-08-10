import { describe, it, expect } from "vitest";
import {
  normalizeJid,
  isLidJid,
  resolveDeliverableJid,
  NEUTRAL_PHONE_SUFFIX,
  RAW_PHONE_SUFFIX,
  LID_SUFFIX,
} from "../src/lid/resolver.js";

describe("lid/resolver", () => {
  describe("normalizeJid", () => {
    it("converts @s.whatsapp.net to @c.us", () => {
      expect(normalizeJid("1234567890@s.whatsapp.net")).toBe(
        `1234567890${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("preserves @c.us JIDs", () => {
      expect(normalizeJid(`1234567890${NEUTRAL_PHONE_SUFFIX}`)).toBe(
        `1234567890${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("preserves @lid JIDs", () => {
      const lid = `abc123${LID_SUFFIX}`;
      expect(normalizeJid(lid)).toBe(lid);
    });

    it("preserves @g.us group JIDs", () => {
      expect(normalizeJid("group@g.us")).toBe("group@g.us");
    });

    it("returns unknown suffixes unchanged", () => {
      expect(normalizeJid("foo@bar.baz")).toBe("foo@bar.baz");
    });
  });

  describe("isLidJid", () => {
    it("returns true for @lid JIDs", () => {
      expect(isLidJid(`user123${LID_SUFFIX}`)).toBe(true);
    });

    it("returns false for @c.us JIDs", () => {
      expect(isLidJid(`1234567890${NEUTRAL_PHONE_SUFFIX}`)).toBe(false);
    });

    it("returns false for @s.whatsapp.net JIDs", () => {
      expect(isLidJid(`1234567890${RAW_PHONE_SUFFIX}`)).toBe(false);
    });

    it("returns false for group JIDs", () => {
      expect(isLidJid("group@g.us")).toBe(false);
    });
  });

  describe("resolveDeliverableJid", () => {
    it("resolves a mapped LID to phone@c.us", () => {
      // Real-world lidMap values come from Baileys with @s.whatsapp.net suffix
      const lid = `lid123${LID_SUFFIX}`;
      const map = new Map([[lid, `5551234${RAW_PHONE_SUFFIX}`]]);
      expect(resolveDeliverableJid(lid, map)).toBe(
        `5551234${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("normalizes a mapping value that already has a raw suffix", () => {
      // Real-world: messaging-history.set and lid-mapping.update
      // store phone JIDs with @s.whatsapp.net, not plain numbers.
      const lid = `27183552696364${LID_SUFFIX}`;
      const map = new Map([[lid, `5215563281307${RAW_PHONE_SUFFIX}`]]);
      expect(resolveDeliverableJid(lid, map)).toBe(
        `5215563281307${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("preserves a mapping value that is already neutral", () => {
      const lid = `27183552696364${LID_SUFFIX}`;
      const map = new Map([[lid, `5215563281307${NEUTRAL_PHONE_SUFFIX}`]]);
      expect(resolveDeliverableJid(lid, map)).toBe(
        `5215563281307${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("returns an unmapped LID as-is", () => {
      const lid = `unknown${LID_SUFFIX}`;
      const map = new Map();
      expect(resolveDeliverableJid(lid, map)).toBe(lid);
    });

    it("normalizes a phone JID", () => {
      const map = new Map();
      expect(resolveDeliverableJid(`1234567890${RAW_PHONE_SUFFIX}`, map)).toBe(
        `1234567890${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("preserves an already-neutral phone JID", () => {
      const map = new Map();
      expect(resolveDeliverableJid(`1234567890${NEUTRAL_PHONE_SUFFIX}`, map)).toBe(
        `1234567890${NEUTRAL_PHONE_SUFFIX}`,
      );
    });

    it("preserves group JIDs", () => {
      const map = new Map();
      expect(resolveDeliverableJid("group@g.us", map)).toBe("group@g.us");
    });
  });
});
