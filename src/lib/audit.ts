import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId, data } });
}
