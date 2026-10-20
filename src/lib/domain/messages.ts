import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import type { ActorRef } from "./transition";

// Override with UPLOAD_DIR on hosts with a read-only app directory (e.g. /tmp/attachments on Vercel).
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "storage", "attachments");
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];

/** Only the customer, the assigned provider and admins may access an order's conversation. */
export async function getConversationAccess(user: ActorRef, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, customerId: true, providerId: true, conversation: { select: { id: true } } },
  });
  if (!order) throw new UserError("Order not found", 404);
  const isParty = user.id === order.customerId || (!!order.providerId && user.id === order.providerId);
  if (!isParty && user.role !== "ADMIN") throw new UserError("You do not have access to this conversation", 403);
  if (!order.conversation) throw new UserError("Messaging opens once the order is paid and assigned", 409);
  return { order, conversationId: order.conversation.id, isParty };
}

export async function listMessages(user: ActorRef, orderId: string) {
  const { conversationId, isParty } = await getConversationAccess(user, orderId);
  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, displayName: true, avatarColor: true, role: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
    take: 500,
  });
  // Admins reading a thread do not mark it read for the parties.
  if (isParty) await markConversationRead(user.id, conversationId);
  return messages;
}

export async function markConversationRead(userId: string, conversationId: string) {
  const now = new Date();
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, lastReadAt: now },
    update: { lastReadAt: now },
  });
}

export type Upload = { name: string; type: string; bytes: Buffer };

export async function sendMessage(user: ActorRef, orderId: string, body: string, files: Upload[] = []) {
  const text = body.trim();
  if (!text && files.length === 0) throw new UserError("Message cannot be empty");
  if (text.length > 4000) throw new UserError("Message is too long (max 4000 characters)");
  if (files.length > 3) throw new UserError("Attach at most 3 files per message");
  for (const f of files) {
    if (f.bytes.length > MAX_ATTACHMENT_BYTES) throw new UserError(`${f.name} is larger than 5 MB`);
    if (!ALLOWED_MIME.includes(f.type)) throw new UserError(`${f.name}: file type not allowed`);
  }
  const { order, conversationId } = await getConversationAccess(user, orderId);

  const stored: { fileName: string; mimeType: string; sizeBytes: number; storageKey: string }[] = [];
  if (files.length) {
    await mkdir(UPLOAD_DIR, { recursive: true });
    for (const f of files) {
      const storageKey = randomBytes(16).toString("hex");
      await writeFile(path.join(UPLOAD_DIR, storageKey), f.bytes);
      stored.push({ fileName: f.name.slice(0, 200), mimeType: f.type, sizeBytes: f.bytes.length, storageKey });
    }
  }

  return db.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: { conversationId, senderId: user.id, body: text, attachments: { create: stored } },
    });
    const now = new Date();
    await tx.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      create: { conversationId, userId: user.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    const recipients = [order.customerId, order.providerId].filter((id): id is string => !!id && id !== user.id);
    for (const r of recipients) {
      // Collapse message notifications: one unread notification per conversation.
      const existing = await tx.notification.findFirst({
        where: { userId: r, type: "NEW_MESSAGE", readAt: null, link: `/dashboard/orders/${orderId}?tab=messages` },
      });
      if (!existing)
        await notify(tx, r, "NEW_MESSAGE", "New message", `You have a new message on order #${order.number}.`, `/dashboard/orders/${orderId}?tab=messages`);
    }
    return msg;
  });
}

/** Unread message counts per order for a user's conversations. */
export async function unreadByOrder(userId: string) {
  const rows = await db.$queryRaw<{ orderId: string; unread: bigint }[]>`
    SELECT c."orderId", COUNT(m.id) AS unread
    FROM "Conversation" c
    JOIN "Order" o ON o.id = c."orderId"
    JOIN "Message" m ON m."conversationId" = c.id AND m."senderId" <> ${userId}
    LEFT JOIN "ConversationRead" r ON r."conversationId" = c.id AND r."userId" = ${userId}
    WHERE (o."customerId" = ${userId} OR o."providerId" = ${userId})
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY c."orderId"`;
  return new Map(rows.map((r) => [r.orderId, Number(r.unread)]));
}
