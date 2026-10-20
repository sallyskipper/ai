import type { NotificationType } from "@prisma/client";
import type { Tx } from "./db";

export async function notify(
  tx: Tx,
  userId: string | null | undefined,
  type: NotificationType,
  title: string,
  body: string,
  link: string,
) {
  if (!userId) return;
  await tx.notification.create({ data: { userId, type, title, body, link } });
}

export async function notifyAdmins(tx: Tx, type: NotificationType, title: string, body: string, link: string) {
  const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (admins.length)
    await tx.notification.createMany({ data: admins.map((a) => ({ userId: a.id, type, title, body, link })) });
}
