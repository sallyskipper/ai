import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notify";
import { getIntSetting } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { actorFor, transition, type ActorRef } from "@/lib/domain/transition";
import { orderLink } from "@/lib/domain/orders";
import { appUrl, gateway, gatewayName } from "./gateway";

// ───────────────────────────── Checkout ─────────────────────────────

/** Creates (or reuses) a pending payment for an order awaiting payment and returns the checkout URL. */
export async function startCheckout(user: ActorRef & { email: string }, orderId: string): Promise<string> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== user.id) throw new UserError("Order not found", 404);
  if (order.status !== "AWAITING_PAYMENT" || !order.agreedPriceCents) throw new UserError("This order is not awaiting payment");

  const name = gatewayName();
  const payment = await db.payment.create({
    data: { orderId, provider: name, amountCents: order.agreedPriceCents, status: "PENDING" },
  });
  const { url, externalId } = await gateway(name).createCheckout({
    paymentId: payment.id,
    orderId,
    orderNumber: order.number,
    description: order.title,
    amountCents: order.agreedPriceCents,
    currency: "usd",
    customerEmail: user.email,
    successUrl: `${appUrl()}/dashboard/orders/${orderId}?checkout=success`,
    cancelUrl: `${appUrl()}/dashboard/orders/${orderId}?checkout=cancelled`,
  });
  await db.payment.update({ where: { id: payment.id }, data: { externalId } });
  return url;
}

/**
 * Records a provider webhook event exactly once. Returns false if it was
 * already processed (duplicate delivery).
 */
async function claimEvent(tx: Tx, eventId: string, provider: string, type: string, payload: unknown) {
  try {
    await tx.paymentEvent.create({ data: { id: eventId, provider, type, payload: payload as Prisma.InputJsonValue } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

/**
 * Called only from verified sources: the Stripe webhook (signature checked) or
 * the development sandbox. A browser redirect never marks an order paid.
 */
export async function handlePaymentSucceeded(args: {
  eventId: string;
  provider: string;
  paymentId: string;
  amountCents: number;
  paymentIntentId: string | null;
  payload: unknown;
}) {
  let refundNeeded: string | null = null;
  await db.$transaction(async (tx) => {
    if (!(await claimEvent(tx, args.eventId, args.provider, "payment.succeeded", args.payload))) return;
    const payment = await tx.payment.findUnique({ where: { id: args.paymentId }, include: { order: true } });
    if (!payment) throw new Error(`Unknown payment ${args.paymentId}`);
    if (payment.status === "SUCCEEDED") return;
    if (args.amountCents !== payment.amountCents)
      throw new Error(`Amount mismatch for payment ${payment.id}: expected ${payment.amountCents}, got ${args.amountCents}`);

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", paymentIntentId: args.paymentIntentId },
    });
    const order = payment.order;

    // The customer may have cancelled or changed selection while paying. Never
    // keep money for an order that cannot proceed: refund it automatically.
    if (order.status !== "AWAITING_PAYMENT" || order.agreedPriceCents !== payment.amountCents) {
      refundNeeded = payment.id;
      await notifyAdmins(tx, "PAYMENT", "Late payment refunded", `Payment for order #${order.number} arrived after the order changed; it is being refunded.`, `/admin/payments`);
      return;
    }

    await transition(tx, order, "PAYMENT_SUCCEEDED", "SYSTEM", null, `Payment of ${formatCents(payment.amountCents)} confirmed`, {
      assignedAt: new Date(),
    });
    await tx.conversation.upsert({ where: { orderId: order.id }, create: { orderId: order.id }, update: {} });
    await tx.ledgerEntry.createMany({
      data: [
        { userId: order.customerId, orderId: order.id, type: "CUSTOMER_CHARGE", status: "SETTLED", amountCents: payment.amountCents, description: `Payment for order #${order.number}` },
        { userId: null, orderId: order.id, type: "PLATFORM_FEE", status: "PENDING", amountCents: order.platformFeeCents ?? 0, description: `Commission on order #${order.number}` },
        { userId: order.providerId, orderId: order.id, type: "PROVIDER_EARNING", status: "PENDING", amountCents: order.providerNetCents ?? 0, description: `Earning for order #${order.number}` },
      ],
    });
    await audit(tx, null, "payment.succeeded", "Payment", payment.id, { orderId: order.id, amountCents: payment.amountCents, provider: args.provider });
    await notify(tx, order.customerId, "PAYMENT", "Payment confirmed", `Payment for order #${order.number} was received. Your provider has been assigned.`, orderLink(order.id));
    await notify(tx, order.providerId, "ORDER_UPDATE", "You've been assigned", `Order #${order.number} is paid and assigned to you. Start when ready.`, orderLink(order.id));
  });
  if (refundNeeded) await executeRefund(refundNeeded, null, "Payment received after order changed", null);
}

export async function handlePaymentFailed(eventId: string, provider: string, paymentId: string, payload: unknown) {
  await db.$transaction(async (tx) => {
    if (!(await claimEvent(tx, eventId, provider, "payment.failed", payload))) return;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment || payment.status !== "PENDING") return;
    await tx.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
    await notify(tx, payment.order.customerId, "PAYMENT", "Payment not completed", `Payment for order #${payment.order.number} did not go through. You can try again.`, orderLink(payment.orderId));
  });
}

// ───────────────────────────── Refunds ─────────────────────────────

/**
 * Sends the refund to the gateway (idempotent) and records the result. The
 * refund row is created before calling out, so a crash leaves a visible
 * pending refund for reconciliation rather than a silent gap.
 */
async function executeRefund(paymentId: string, orderId: string | null, reason: string, actorId: string | null) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const amount = payment.amountCents - payment.refundedCents;
  if (amount <= 0) return;
  const refund = await db.refund.create({ data: { paymentId, amountCents: amount, reason, status: "pending" } });
  try {
    const { externalId } = await gateway(payment.provider).refund({
      paymentIntentId: payment.paymentIntentId,
      externalId: payment.externalId,
      amountCents: amount,
      idempotencyKey: `refund_${refund.id}`,
    });
    await db.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { externalId, status: "succeeded" } });
      await tx.payment.update({
        where: { id: paymentId },
        data: { refundedCents: { increment: amount }, status: "REFUNDED" },
      });
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
      await tx.ledgerEntry.create({
        data: { userId: p.order.customerId, orderId: p.orderId, type: "REFUND", status: "SETTLED", amountCents: amount, description: `Refund for order #${p.order.number}` },
      });
      await audit(tx, actorId, "refund.succeeded", "Payment", paymentId, { amount, orderId });
      await notify(tx, p.order.customerId, "PAYMENT", "Refund issued", `${formatCents(amount)} was refunded for order #${p.order.number}.`, orderLink(p.orderId));
    });
  } catch (e) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "failed" } });
    await db.$transaction(async (tx) => {
      await audit(tx, actorId, "refund.failed", "Payment", paymentId, { error: String(e) });
      await notifyAdmins(tx, "PAYMENT", "Refund failed", `A refund of ${formatCents(amount)} failed and needs attention.`, `/admin/payments`);
    });
    throw new UserError("The refund could not be processed automatically. Support has been notified.", 502);
  }
}

async function reverseEarnings(tx: Tx, orderId: string) {
  await tx.ledgerEntry.updateMany({
    where: { orderId, type: { in: ["PROVIDER_EARNING", "PLATFORM_FEE"] }, status: { in: ["PENDING", "HELD", "AVAILABLE"] } },
    data: { status: "REVERSED" },
  });
}

/** The other party (or an admin) accepts a cancellation request: full refund. */
export async function acceptCancellation(user: ActorRef, orderId: string) {
  const paymentId = await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    if (order.cancelRequestedById === user.id) throw new UserError("The other party must respond to your request");
    // Guard against refunding earnings already paid out.
    const paidOut = await tx.ledgerEntry.count({ where: { orderId, type: "PROVIDER_EARNING", status: "PAID" } });
    if (paidOut) throw new UserError("Earnings for this order were already paid out; contact support", 409);
    await transition(tx, order, "ACCEPT_CANCELLATION", actor, user.id, "Cancellation accepted — full refund issued", {
      cancelledAt: new Date(),
      previousStatus: null,
    });
    await reverseEarnings(tx, orderId);
    for (const uid of [order.customerId, order.providerId])
      await notify(tx, uid, "CANCELLATION", "Order cancelled", `Order #${order.number} was cancelled and refunded.`, orderLink(orderId));
    if (actor === "ADMIN") await audit(tx, user.id, "order.cancel_refund", "Order", orderId);
    const payment = await tx.payment.findFirst({ where: { orderId, status: "SUCCEEDED" } });
    return payment?.id ?? null;
  });
  if (paymentId) await executeRefund(paymentId, orderId, "Cancellation accepted", user.id);
}

export async function resolveDisputeRefund(user: ActorRef, orderId: string, resolution: string) {
  if (user.role !== "ADMIN") throw new UserError("Admins only", 403);
  const paymentId = await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const paidOut = await tx.ledgerEntry.count({ where: { orderId, type: "PROVIDER_EARNING", status: "PAID" } });
    if (paidOut) throw new UserError("Earnings for this order were already paid out; handle manually", 409);
    await transition(tx, order, "RESOLVE_REFUND", "ADMIN", user.id, `Dispute resolved — customer refunded. ${resolution}`, {
      cancelledAt: new Date(),
      previousStatus: null,
    });
    await tx.dispute.updateMany({
      where: { orderId, status: "OPEN" },
      data: { status: "RESOLVED_REFUND", resolution, resolvedById: user.id, resolvedAt: new Date() },
    });
    await reverseEarnings(tx, orderId);
    await audit(tx, user.id, "dispute.refund", "Order", orderId, { resolution });
    for (const uid of [order.customerId, order.providerId])
      await notify(tx, uid, "DISPUTE", "Dispute resolved", `The dispute on order #${order.number} was resolved with a refund to the customer.`, orderLink(orderId));
    const payment = await tx.payment.findFirst({ where: { orderId, status: "SUCCEEDED" } });
    return payment?.id ?? null;
  });
  if (paymentId) await executeRefund(paymentId, orderId, "Dispute resolved in customer's favour", user.id);
}

// ───────────────────────────── Earnings & payouts ─────────────────────────────

export async function providerBalances(userId: string) {
  const rows = await db.ledgerEntry.groupBy({
    by: ["type", "status"],
    where: { userId },
    _sum: { amountCents: true },
  });
  const sum = (type: string, statuses: string[]) =>
    rows.filter((r) => r.type === type && statuses.includes(r.status)).reduce((s, r) => s + (r._sum.amountCents ?? 0), 0);
  const now = new Date();
  const maturing = await db.ledgerEntry.aggregate({
    where: { userId, type: "PROVIDER_EARNING", status: "AVAILABLE", availableAt: { gt: now } },
    _sum: { amountCents: true },
  });
  const notYetAvailable = maturing._sum.amountCents ?? 0;
  return {
    pending: sum("PROVIDER_EARNING", ["PENDING"]) + notYetAvailable,
    held: sum("PROVIDER_EARNING", ["HELD"]),
    available: sum("PROVIDER_EARNING", ["AVAILABLE"]) - notYetAvailable,
    paid: sum("PROVIDER_EARNING", ["PAID"]),
    reversed: sum("PROVIDER_EARNING", ["REVERSED"]),
  };
}

export async function requestPayout(user: ActorRef) {
  if (user.role !== "PROVIDER") throw new UserError("Only providers can request payouts", 403);
  const profile = await db.providerProfile.findUnique({ where: { userId: user.id } });
  if (profile?.status !== "APPROVED") throw new UserError("Your provider account is not active");
  const name = gatewayName();
  if (name === "stripe" && (!profile.stripeAccountId || !profile.payoutsEnabled))
    throw new UserError("Connect and verify your payout account before requesting a payout");

  const payout = await db.$transaction(async (tx) => {
    const entries = await tx.ledgerEntry.findMany({
      where: { userId: user.id, type: "PROVIDER_EARNING", status: "AVAILABLE", availableAt: { lte: new Date() } },
    });
    const amount = entries.reduce((s, e) => s + e.amountCents, 0);
    const min = await getIntSetting(tx, "minPayoutCents");
    if (amount <= 0) throw new UserError("You have no available earnings to withdraw");
    if (amount < min) throw new UserError(`Minimum payout is ${formatCents(min)}`);
    const p = await tx.payout.create({ data: { userId: user.id, amountCents: amount, status: "PROCESSING", provider: name } });
    // Claim exactly these entries; if any changed concurrently, abort.
    const claimed = await tx.ledgerEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) }, status: "AVAILABLE" },
      data: { status: "PAID", payoutId: p.id },
    });
    if (claimed.count !== entries.length) throw new UserError("Your balance changed; please try again", 409);
    await audit(tx, user.id, "payout.requested", "Payout", p.id, { amount });
    return p;
  });

  try {
    const { externalId } = await gateway(name).transfer({
      destination: profile.stripeAccountId,
      amountCents: payout.amountCents,
      currency: "usd",
      idempotencyKey: `payout_${payout.id}`,
      description: `Redline payout ${payout.id}`,
    });
    await db.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: { status: "PAID", externalId } });
      await tx.ledgerEntry.create({
        data: { userId: user.id, payoutId: payout.id, type: "PAYOUT", status: "SETTLED", amountCents: payout.amountCents, description: "Payout sent" },
      });
      await notify(tx, user.id, "PAYOUT", "Payout sent", `${formatCents(payout.amountCents)} was sent to your payout account.`, "/dashboard/payouts");
    });
  } catch (e) {
    await db.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: String(e).slice(0, 500) } });
      await tx.ledgerEntry.updateMany({ where: { payoutId: payout.id, type: "PROVIDER_EARNING" }, data: { status: "AVAILABLE", payoutId: null } });
      await notify(tx, user.id, "PAYOUT", "Payout failed", "Your payout could not be sent. Your balance has been restored.", "/dashboard/payouts");
      await audit(tx, null, "payout.failed", "Payout", payout.id, { error: String(e) });
    });
    throw new UserError("Payout failed. Your balance has been restored.", 502);
  }
  return payout;
}
