import { prisma } from "@senda-bot/db"; // ← replace with your Prisma client import
import type {
  IDatabaseAdapter,
  SessionRecord,
  StoredMessage,
  ContactRecord,
  ChatRecord,
} from "@erickcosta98/whatsapp-framework";

/**
 * Prisma-based database adapter for the whatsapp-framework.
 *
 * Drop this file into your project, update the Prisma import path, and
 * register it with the engine:
 *
 *   engine.registerAdapter(new PrismaAdapter());
 *
 * Requires the 5 tables from schema.prisma (wa_auth_state, wa_lid_mappings,
 * wa_message_store, wa_contacts, wa_chats).
 */
export class PrismaAdapter implements IDatabaseAdapter {
  async initialize(): Promise<void> {
    // Prisma runs migrations separately — nothing to do here.
  }

  // ── Sessions (auth state) ────────────────────────────────────

  async saveSession(id: string, data: SessionRecord): Promise<void> {
    await prisma.waAuthState.upsert({
      where: { sessionName: id },
      update: { data: data as any },
      create: { sessionName: id, data: data as any },
    });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await prisma.waAuthState.findUnique({ where: { sessionName: id } });
    return row ? (row.data as unknown as SessionRecord) : undefined;
  }

  async deleteSession(id: string): Promise<void> {
    await prisma.waAuthState.deleteMany({ where: { sessionName: id } });
  }

  // ── Messages (retry protocol) ────────────────────────────────

  async saveMessage(keyId: string, message: StoredMessage): Promise<void> {
    await prisma.waMessageStore.upsert({
      where: { keyId },
      update: { message: message as any },
      create: { keyId, message: message as any },
    });
  }

  async getMessage(keyId: string): Promise<StoredMessage | undefined> {
    const row = await prisma.waMessageStore.findUnique({ where: { keyId } });
    return row ? (row.message as unknown as StoredMessage) : undefined;
  }

  async deleteMessage(keyId: string): Promise<void> {
    await prisma.waMessageStore.deleteMany({ where: { keyId } });
  }

  async clearSessionMessages(_sessionId: string): Promise<void> {
    // keyId already encodes session ownership — no-op at DB level.
  }

  // ── LID mappings ─────────────────────────────────────────────

  async upsertLidMapping(lid: string, phone: string): Promise<void> {
    await prisma.waLidMapping.upsert({
      where: { lid },
      update: { phone },
      create: { lid, phone },
    });
  }

  async getPhoneForLid(lid: string): Promise<string | undefined> {
    const row = await prisma.waLidMapping.findUnique({ where: { lid } });
    return row?.phone ?? undefined;
  }

  async getAllLidMappings(): Promise<Map<string, string>> {
    const rows = await prisma.waLidMapping.findMany();
    return new Map(rows.map((r) => [r.lid, r.phone]));
  }

  // ── Contacts ─────────────────────────────────────────────────

  async upsertContact(id: string, data: Partial<ContactRecord>): Promise<void> {
    const existing = await prisma.waContact.findUnique({ where: { id } });
    if (existing) {
      await prisma.waContact.update({ where: { id }, data: data as any });
    } else {
      await prisma.waContact.create({
        data: {
          id,
          name: data.name ?? null,
          pushName: data.pushName ?? null,
          number: data.number ?? null,
          isMyContact: data.isMyContact ?? false,
          isBlocked: data.isBlocked ?? false,
        },
      });
    }
  }

  async getContact(id: string): Promise<ContactRecord | undefined> {
    const row = await prisma.waContact.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name ?? undefined,
      pushName: row.pushName ?? undefined,
      number: row.number ?? undefined,
      isMyContact: row.isMyContact,
      isBlocked: row.isBlocked,
    };
  }

  async listContacts(): Promise<ContactRecord[]> {
    const rows = await prisma.waContact.findMany();
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? undefined,
      pushName: r.pushName ?? undefined,
      number: r.number ?? undefined,
      isMyContact: r.isMyContact,
      isBlocked: r.isBlocked,
    }));
  }

  // ── Chats ────────────────────────────────────────────────────

  async upsertChat(jid: string, data: Partial<ChatRecord>): Promise<void> {
    const existing = await prisma.waChat.findUnique({ where: { jid } });
    if (existing) {
      await prisma.waChat.update({ where: { jid }, data: data as any });
    } else {
      await prisma.waChat.create({
        data: {
          jid,
          name: data.name ?? null,
          phoneJid: data.phoneJid ?? null,
          unreadCount: data.unreadCount ?? 0,
          lastMessageTimestamp:
            data.lastMessageTimestamp != null
              ? BigInt(data.lastMessageTimestamp)
              : null,
        },
      });
    }
  }

  async getChat(jid: string): Promise<ChatRecord | undefined> {
    const row = await prisma.waChat.findUnique({ where: { jid } });
    if (!row) return undefined;
    return {
      jid: row.jid,
      name: row.name ?? undefined,
      phoneJid: row.phoneJid ?? undefined,
      unreadCount: row.unreadCount,
      lastMessageTimestamp: row.lastMessageTimestamp
        ? Number(row.lastMessageTimestamp)
        : undefined,
    };
  }
}
