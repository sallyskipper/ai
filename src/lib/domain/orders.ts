import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notify";
import { getCommissionBps, getIntSetting } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { coachingName } from "@/lib/valorant";
import { baseOrderSchema, detailsSchemaFor } from "./order-details";
import { computeMinPrice, PricingError, splitCommission, type MinPriceResult } from "./pricing";
import { actorFor, transition, type ActorRef } from "./transition";
import { OPEN_STATUSES } from "./order-machine";

export const orderLink = (id: string) => `/dashboard/orders/${id}`;

function zodMessage(e: { issues: { message: string; path: PropertyKey[] }[] }) {
  return e.issues[0]?.message ?? "Invalid input";
}

async function loadBookableService(tx: Tx, slug: string) {
  const service = await tx.service.findUnique({
    where: { slug },
    include: { pricingRules: { where: { active: true } } },
  });
  if (!service || !service.enabled) throw new UserError("This service is not currently available");
  if (service.accountOperated && !service.complianceReviewedAt)
    throw new UserError("This service is pending compliance review and cannot be ordered yet");
  return service;
}

export async function quoteMinPrice(serviceSlug: string, rawDetails: unknown): Promise<MinPriceResult> {
  const service = await loadBookableService(db, serviceSlug);
  const parsed = detailsSchemaFor(service.kind).safeParse(rawDetails);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  try {
    return computeMinPrice(service.kind, parsed.data, service.pricingRules, service.floorPriceCents);
  } catch (e) {
    if (e instanceof PricingError) throw new UserError(e.message);
    throw e;
  }
}

function orderTitle(kind: string, d: Record<string, unknown>): string {
  if (kind === "SOLO_RANK_UP") return `Solo Rank Up · ${d.currentRank} → ${d.desiredRank}`;
  if (kind === "DUO_RANK_UP")
    return d.mode === "GAMES"
      ? `Duo Rank Up · ${d.games} games from ${d.currentRank}`
      : `Duo Rank Up · ${d.currentRank} → ${d.targetRank}`;
  return `Coaching · ${coachingName(String(d.coachingType))} · ${d.sessions}×${d.sessionMinutes}min`;
}

export type CreateOrderInput = {
  serviceSlug: string;
  region: string;
  details: unknown;
  notes?: string;
  deadline?: string;
  budgetCents?: number;
  publish: boolean;
};

export async function createOrder(user: ActorRef, input: CreateOrderInput) {
  if (user.role !== "CUSTOMER") throw new UserError("Only customer accounts can create orders", 403);
  const base = baseOrderSchema.safeParse({
    region: input.region,
    notes: input.notes ?? "",
    deadline: input.deadline || undefined,
    budgetCents: input.budgetCents,
  });
  if (!base.success) throw new UserError(zodMessage(base.error));

  return db.$transaction(async (tx) => {
    const service = await loadBookableService(tx, input.serviceSlug);
    const details = detailsSchemaFor(service.kind).safeParse(input.details);
    if (!details.success) throw new UserError(zodMessage(details.error));

    let quote: MinPriceResult;
    try {
      quote = computeMinPrice(service.kind, details.data, service.pricingRules, service.floorPriceCents);
    } catch (e) {
      if (e instanceof PricingError) throw new UserError(e.message);
      throw e;
    }
    if (base.data.budgetCents !== undefined && base.data.budgetCents < quote.minPriceCents)
      throw new UserError(`Your budget must be at least the minimum price of ${formatCents(quote.minPriceCents)}`);

    const now = new Date();
    const order = await tx.order.create({
      data: {
        customerId: user.id,
        serviceId: service.id,
        status: input.publish ? "OPEN_FOR_OFFERS" : "DRAFT",
        title: orderTitle(service.kind, details.data as Record<string, unknown>),
        region: base.data.region,
        details: details.data as Prisma.InputJsonValue,
        notes: base.data.notes,
        deadline: base.data.deadline,
        budgetCents: base.data.budgetCents,
        minPriceCents: quote.minPriceCents,
        pricingSnapshot: { ...quote, serviceSlug: service.slug, computedAt: now.toISOString() },
        publishedAt: input.publish ? now : null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorId: user.id,
        toStatus: order.status,
        type: "CREATED",
        message: input.publish
          ? `Order created and opened for offers (minimum ${formatCents(quote.minPriceCents)})`
          : "Order saved as draft",
      },
    });
    return order;
  });
}

export async function publishOrder(user: ActorRef, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    await transition(tx, order, "PUBLISH", actor, user.id, "Order opened for offers", { publishedAt: new Date() });
  });
}

// ───────────────────────────── Offers ─────────────────────────────

export type OfferInput = { priceCents: number; etaHours: number; message: string };

async function requireApprovedProvider(tx: Tx, user: ActorRef) {
  if (user.role !== "PROVIDER") throw new UserError("Only provider accounts can submit offers", 403);
  const profile = await tx.providerProfile.findUnique({ where: { userId: user.id } });
  if (profile?.status !== "APPROVED") throw new UserError("Only approved providers can bid on paid orders", 403);
  return profile;
}

export async function submitOffer(user: ActorRef, orderId: string, input: OfferInput) {
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) throw new UserError("Enter a valid price");
  if (!Number.isInteger(input.etaHours) || input.etaHours < 1 || input.etaHours > 24 * 60)
    throw new UserError("Estimated completion must be between 1 hour and 60 days");
  const message = (input.message ?? "").trim();
  if (message.length < 10 || message.length > 1000) throw new UserError("Offer message must be 10–1000 characters");

  return db.$transaction(async (tx) => {
    const profile = await requireApprovedProvider(tx, user);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { service: true } });
    if (!order) throw new UserError("Order not found", 404);
    if (!OPEN_STATUSES.includes(order.status)) throw new UserError("This order is no longer accepting offers");
    if (order.customerId === user.id) throw new UserError("You cannot bid on your own order");
    if (!profile.supportedServices.includes(order.service.slug))
      throw new UserError("Add this service to your provider profile before bidding on it");
    // Enforced here, on the server, against the snapshot stored on the order.
    if (input.priceCents < order.minPriceCents)
      throw new UserError(`Offer must be at least the minimum accepted price of ${formatCents(order.minPriceCents)}`);

    const existing = await tx.offer.findUnique({ where: { orderId_providerId: { orderId, providerId: user.id } } });
    if (existing && existing.status !== "ACTIVE" && existing.status !== "WITHDRAWN")
      throw new UserError("Your offer on this order is closed");
    const data = {
      priceCents: input.priceCents,
      minPriceCents: order.minPriceCents,
      etaHours: input.etaHours,
      message,
      status: "ACTIVE" as const,
    };
    const offer = existing
      ? await tx.offer.update({ where: { id: existing.id }, data })
      : await tx.offer.create({ data: { ...data, orderId, providerId: user.id } });

    if (order.status === "OPEN_FOR_OFFERS")
      await transition(tx, order, "OFFER_RECEIVED", "SYSTEM", null, "First offer received");
    await notify(
      tx,
      order.customerId,
      "NEW_OFFER",
      existing ? "Offer updated" : "New offer received",
      `A provider offered ${formatCents(input.priceCents)} on order #${order.number}.`,
      `${orderLink(order.id)}?tab=offers`,
    );
    return offer;
  });
}

export async function withdrawOffer(user: ActorRef, offerId: string) {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { order: true } });
    if (!offer || offer.providerId !== user.id) throw new UserError("Offer not found", 404);
    if (offer.status !== "ACTIVE") throw new UserError("Only active offers can be withdrawn");
    if (!OPEN_STATUSES.includes(offer.order.status))
      throw new UserError("The customer has already selected an offer on this order");
    await tx.offer.update({ where: { id: offerId }, data: { status: "WITHDRAWN" } });
  });
}

/**
 * Customer selects an offer. Reserves the provider, closes competing offers and
 * snapshots the agreed price + commission. The order then awaits payment; the
 * provider is only assigned once payment is verified server-side.
 */
export async function acceptOffer(user: ActorRef, offerId: string) {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { order: true } });
    if (!offer) throw new UserError("Offer not found", 404);
    const order = offer.order;
    if (order.customerId !== user.id) throw new UserError("Only the customer can accept offers", 403);
    if (offer.status !== "ACTIVE") throw new UserError("This offer is no longer available");
    // Defensive re-check: the minimum may never be bypassed.
    if (offer.priceCents < order.minPriceCents) throw new UserError("This offer is below the minimum price");
    const provider = await tx.providerProfile.findUnique({ where: { userId: offer.providerId } });
    if (provider?.status !== "APPROVED") throw new UserError("This provider is not currently available");

    const commissionBps = await getCommissionBps(tx, offer.priceCents);
    const split = splitCommission(offer.priceCents, commissionBps);
    await transition(tx, order, "ACCEPT_OFFER", "CUSTOMER", user.id, `Offer accepted at ${formatCents(offer.priceCents)}`, {
      providerId: offer.providerId,
      acceptedOfferId: offer.id,
      agreedPriceCents: offer.priceCents,
      commissionBps,
      ...split,
    });
    await tx.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
    await tx.offer.updateMany({
      where: { orderId: order.id, id: { not: offer.id }, status: "ACTIVE" },
      data: { status: "DECLINED" },
    });
    await notify(
      tx,
      offer.providerId,
      "ORDER_UPDATE",
      "Your offer was selected",
      `The customer selected your offer on order #${order.number}. You'll be assigned once payment is confirmed.`,
      orderLink(order.id),
    );
    return order.id;
  });
}

/** Before paying, the customer may go back and choose a different offer. */
export async function changeSelection(user: ActorRef, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.customerId !== user.id) throw new UserError("Not your order", 403);
    const pending = await tx.payment.count({ where: { orderId, status: "SUCCEEDED" } });
    if (pending) throw new UserError("Payment has already been received for this order");
    const previousProvider = order.providerId;
    await transition(tx, order, "CHANGE_SELECTION", "CUSTOMER", user.id, "Customer reopened provider selection", {
      providerId: null,
      acceptedOfferId: null,
      agreedPriceCents: null,
      commissionBps: null,
      platformFeeCents: null,
      providerNetCents: null,
    });
    // Previously closed offers become selectable again (except withdrawn ones).
    await tx.offer.updateMany({
      where: { orderId, status: { in: ["ACCEPTED", "DECLINED"] } },
      data: { status: "ACTIVE" },
    });
    await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } });
    await notify(tx, previousProvider, "ORDER_UPDATE", "Selection changed", `The customer reopened order #${order.number} before paying.`, orderLink(orderId));
  });
}

// ───────────────────────────── Work lifecycle ─────────────────────────────

export async function startOrder(user: ActorRef, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    await transition(tx, order, "START", actor, user.id, "Provider started work", { startedAt: new Date() });
    await notify(tx, order.customerId, "ORDER_UPDATE", "Work started", `Your provider started order #${order.number}.`, orderLink(orderId));
  });
}

export async function submitCompletion(user: ActorRef, orderId: string, note: string) {
  const text = note.trim();
  if (text.length < 10) throw new UserError("Describe what was completed (at least 10 characters)");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    await transition(tx, order, "SUBMIT_COMPLETION", actor, user.id, "Provider submitted completion", {
      completionSubmittedAt: new Date(),
      completionNote: text.slice(0, 2000),
    });
    await transition(tx, order, "AWAIT_CONFIRMATION", "SYSTEM", null, "Waiting for customer confirmation");
    await notify(
      tx,
      order.customerId,
      "COMPLETION",
      "Please confirm completion",
      `Your provider marked order #${order.number} as complete. Confirm it or open a dispute.`,
      orderLink(orderId),
    );
  });
}

/** Moves the provider's pending earning to available (after the configured hold). */
async function releaseEarnings(tx: Tx, orderId: string) {
  const holdHours = await getIntSetting(tx, "payoutHoldHours");
  const availableAt = new Date(Date.now() + holdHours * 3600_000);
  await tx.ledgerEntry.updateMany({
    where: { orderId, type: "PROVIDER_EARNING", status: { in: ["PENDING", "HELD"] } },
    data: { status: "AVAILABLE", availableAt },
  });
  await tx.ledgerEntry.updateMany({
    where: { orderId, type: "PLATFORM_FEE", status: "PENDING" },
    data: { status: "SETTLED" },
  });
}

export async function confirmCompletion(user: ActorRef, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    await transition(tx, order, "CONFIRM_COMPLETION", actor, user.id, "Customer confirmed completion", { completedAt: new Date() });
    await releaseEarnings(tx, orderId);
    await notify(
      tx,
      order.providerId,
      "COMPLETION",
      "Order completed",
      `The customer confirmed order #${order.number}. ${formatCents(order.providerNetCents)} has moved to your earnings.`,
      "/dashboard/earnings",
    );
  });
}

// ───────────────────────────── Cancellation & disputes ─────────────────────────────

/** Cancel an unpaid order. Paid orders go through requestCancellation instead. */
export async function cancelOrder(user: ActorRef, orderId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    const paid = await tx.payment.count({ where: { orderId, status: "SUCCEEDED" } });
    if (paid) throw new UserError("This order has been paid. Request a cancellation instead.");
    await transition(tx, order, "CANCEL", actor, user.id, `Order cancelled${reason ? `: ${reason}` : ""}`, {
      cancelledAt: new Date(),
      cancelReason: reason || null,
    });
    await tx.offer.updateMany({ where: { orderId, status: { in: ["ACTIVE", "ACCEPTED"] } }, data: { status: "DECLINED" } });
    await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } });
    await notify(tx, order.providerId, "CANCELLATION", "Order cancelled", `Order #${order.number} was cancelled before payment.`, orderLink(orderId));
    if (actor === "ADMIN") await audit(tx, user.id, "order.cancel", "Order", orderId, { reason });
  });
}

export async function requestCancellation(user: ActorRef, orderId: string, reason: string) {
  if (reason.trim().length < 5) throw new UserError("Please give a reason for the cancellation");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    const prev = order.status;
    await transition(tx, order, "REQUEST_CANCELLATION", actor, user.id, `Cancellation requested: ${reason}`, {
      previousStatus: prev,
      cancelRequestedById: user.id,
      cancelReason: reason.slice(0, 1000),
    });
    const other = actor === "CUSTOMER" ? order.providerId : order.customerId;
    await notify(tx, other, "CANCELLATION", "Cancellation requested", `A cancellation was requested on order #${order.number}.`, orderLink(orderId));
  });
}

export async function declineCancellation(user: ActorRef, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    if (order.cancelRequestedById === user.id) throw new UserError("The other party must respond to your request");
    await transition(tx, order, "DECLINE_CANCELLATION", actor, user.id, "Cancellation request declined", {
      previousStatus: null,
      cancelRequestedById: null,
    });
    await notify(tx, order.cancelRequestedById, "CANCELLATION", "Cancellation declined", `Your cancellation request on order #${order.number} was declined. You can open a dispute if needed.`, orderLink(orderId));
  });
}

export async function openDispute(user: ActorRef, orderId: string, reason: string) {
  if (reason.trim().length < 10) throw new UserError("Describe the problem (at least 10 characters)");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const actor = actorFor(order, user);
    if (actor === "ADMIN") throw new UserError("Admins resolve disputes rather than opening them");
    const prev = order.status;
    await transition(tx, order, "OPEN_DISPUTE", actor, user.id, "Dispute opened", { previousStatus: prev });
    await tx.dispute.create({ data: { orderId, openedById: user.id, reason: reason.slice(0, 2000) } });
    // Disputed funds are never released automatically.
    await tx.ledgerEntry.updateMany({
      where: { orderId, type: "PROVIDER_EARNING", status: { in: ["PENDING", "AVAILABLE"] } },
      data: { status: "HELD" },
    });
    const other = actor === "CUSTOMER" ? order.providerId : order.customerId;
    await notify(tx, other, "DISPUTE", "Dispute opened", `A dispute was opened on order #${order.number}. Support will review it.`, orderLink(orderId));
    await notifyAdmins(tx, "DISPUTE", "New dispute", `Order #${order.number} needs review.`, `/admin/disputes`);
  });
}

/** Admin resolves an open dispute in the provider's favour (release funds). */
export async function resolveDisputeRelease(user: ActorRef, orderId: string, resolution: string) {
  if (user.role !== "ADMIN") throw new UserError("Admins only", 403);
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await transition(tx, order, "RESOLVE_RELEASE", "ADMIN", user.id, `Dispute resolved — funds released. ${resolution}`, {
      completedAt: new Date(),
      previousStatus: null,
    });
    await tx.dispute.updateMany({
      where: { orderId, status: "OPEN" },
      data: { status: "RESOLVED_RELEASE", resolution, resolvedById: user.id, resolvedAt: new Date() },
    });
    await releaseEarnings(tx, orderId);
    await audit(tx, user.id, "dispute.release", "Order", orderId, { resolution });
    for (const uid of [order.customerId, order.providerId])
      await notify(tx, uid, "DISPUTE", "Dispute resolved", `The dispute on order #${order.number} was resolved in the provider's favour.`, orderLink(orderId));
  });
}

// ───────────────────────────── Queries ─────────────────────────────

/** Loads an order the viewer is allowed to see, or throws. */
export async function getOrderForViewer(user: ActorRef, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      service: true,
      customer: { select: { id: true, displayName: true, avatarColor: true, createdAt: true } },
      provider: { select: { id: true, displayName: true, avatarColor: true } },
      acceptedOffer: true,
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, include: { refunds: true } },
      disputes: { orderBy: { createdAt: "desc" } },
      review: true,
      conversation: { select: { id: true } },
      _count: { select: { offers: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!order) return null;
  const isParty = order.customerId === user.id || order.providerId === user.id;
  if (isParty || user.role === "ADMIN") return order;
  // Approved providers may view orders that are open for bidding, or that they bid on.
  if (user.role === "PROVIDER") {
    const profile = await db.providerProfile.findUnique({ where: { userId: user.id } });
    const bid = await db.offer.findUnique({ where: { orderId_providerId: { orderId, providerId: user.id } } });
    if (profile?.status === "APPROVED" && (OPEN_STATUSES.includes(order.status) || bid)) return order;
  }
  return null;
}
