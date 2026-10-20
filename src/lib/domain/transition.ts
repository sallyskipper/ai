import type { Order, OrderStatus, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { type Actor, type OrderAction, planTransition } from "./order-machine";

export type ActorRef = { id: string; role: "CUSTOMER" | "PROVIDER" | "ADMIN" };

/** How the acting user relates to this order. Throws if they have no access. */
export function actorFor(order: Pick<Order, "customerId" | "providerId">, user: ActorRef): Actor {
  if (user.id === order.customerId) return "CUSTOMER";
  if (order.providerId && user.id === order.providerId) return "PROVIDER";
  if (user.role === "ADMIN") return "ADMIN";
  throw new UserError("You do not have access to this order", 403);
}

/**
 * Applies a state-machine transition with optimistic locking: the update only
 * succeeds if nobody else changed the order since it was read.
 */
export async function transition(
  tx: Tx,
  order: Pick<Order, "id" | "status" | "previousStatus" | "version">,
  action: OrderAction,
  actor: Actor,
  actorId: string | null,
  message: string,
  data: Prisma.OrderUncheckedUpdateManyInput = {},
): Promise<OrderStatus> {
  const to = planTransition(action, order, actor);
  const res = await tx.order.updateMany({
    where: { id: order.id, version: order.version, status: order.status },
    data: { ...data, status: to, version: { increment: 1 } },
  });
  if (res.count !== 1) throw new UserError("This order was just updated by someone else. Refresh and try again.", 409);
  await tx.orderEvent.create({
    data: { orderId: order.id, actorId, fromStatus: order.status, toStatus: to, type: action, message },
  });
  order.status = to;
  order.version += 1;
  return to;
}
