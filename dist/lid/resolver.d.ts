/**
 * LID (privacy ID) resolution utilities.
 *
 * WhatsApp uses two JID dialects:
 *   - `<phone>@s.whatsapp.net` / `<phone>@c.us` — phone-based
 *   - `<lid>@lid` — privacy-id based (no known phone)
 *
 * This module normalizes JIDs to the neutral `@c.us` dialect and resolves
 * LIDs to phone numbers via a mapping table.
 */
/** Suffix for phone-based JIDs in the neutral dialect. */
export declare const NEUTRAL_PHONE_SUFFIX = "@c.us";
/** Suffix for phone-based JIDs in the raw Baileys dialect. */
export declare const RAW_PHONE_SUFFIX = "@s.whatsapp.net";
/** Suffix for LID (privacy) JIDs. */
export declare const LID_SUFFIX = "@lid";
/**
 * Normalize a JID to the neutral dialect.
 *
 * - `<phone>@s.whatsapp.net` → `<phone>@c.us`
 * - `<lid>@lid` → preserved as-is
 * - anything else → returned as-is
 *
 * @param jid — raw JID string
 * @returns normalized JID string
 */
export declare function normalizeJid(jid: string): string;
/**
 * Check whether a JID is an LID (privacy-id) JID.
 *
 * @param jid — JID string
 * @returns true if the JID ends with `@lid`
 */
export declare function isLidJid(jid: string): boolean;
/**
 * Resolve a JID to a deliverable form.
 *
 * If the JID is an LID, look up its mapped phone number in `lidMap`.
 * If a mapping exists, return the phone as `<phone>@c.us`.
 * If no mapping exists, return the LID as-is ( WhatsApp can still deliver ).
 * Non-LID JIDs are normalized via {@link normalizeJid}.
 *
 * @param jid — target JID
 * @param lidMap — Map<LID, phone> lookup table
 * @returns deliverable JID string
 */
export declare function resolveDeliverableJid(jid: string, lidMap: Map<string, string>): string;
//# sourceMappingURL=resolver.d.ts.map