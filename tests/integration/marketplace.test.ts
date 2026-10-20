import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acceptOffer, cancelOrder, changeSelection, confirmCompletion, createOrder, openDispute,
  quoteMinPrice, startOrder, submitCompletion, submitOffer, resolveDisputeRelease,
} from "@/lib/domain/orders";
import { acceptCancellation, handlePaymentSucceeded, providerBalances, requestPayout, resolveDisputeRefund, startCheckout } from "@/lib/payments/service";
import { requestCancellation } from "@/lib/domain/orders";
import { createReview } from "@/lib/domain/reviews";
import { listMessages, sendMessage } from "@/lib/domain/messages";
import { coachingOrder, makeUser } from "./helpers";

const offer = (priceCents: number) => ({ priceCents, etaHours: 24, message: "Happy to help you improve this week." });

async function payOrder(orderId: string, customer: Awaited<ReturnType<typeof makeUser>>) {
  await startCheckout(customer, orderId);
  const payment = await db.payment.findFirstOrThrow({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  await handlePaymentSucceeded({ eventId: `evt_${payment.id}`, provider: "sandbox", paymentId: payment.id, amountCents: payment.amountCents, paymentIntentId: null, payload: {} });
  return payment;
}

async function assignedOrder() {
  const customer = await makeUser("CUSTOMER");
  const provider = await makeUser("PROVIDER", "APPROVED");
  const order = await createOrder(customer, coachingOrder);
  const o = await submitOffer(provider, order.id, offer(order.minPriceCents + 1000));
  await acceptOffer(customer, o.id);
  await payOrder(order.id, customer);
  return { customer, provider, order };
}

describe("minimum price enforcement", () => {
  it("snapshots the minimum on the order and rejects offers below it on the server", async () => {
    const customer = await makeUser("CUSTOMER");
    const provider = await makeUser("PROVIDER", "APPROVED");
    const quote = await quoteMinPrice("valorant-coaching", coachingOrder.details);
    const order = await createOrder(customer, coachingOrder);
    expect(order.minPriceCents).toBe(quote.minPriceCents);
    expect(order.minPriceCents).toBe(5000); // 2h × $25
    await expect(submitOffer(provider, order.id, offer(order.minPriceCents - 1))).rejects.toThrow(/minimum/);
    await expect(submitOffer(provider, order.id, offer(order.minPriceCents))).resolves.toBeTruthy();
  });

  it("existing orders keep their minimum when admins change pricing later", async () => {
    const customer = await makeUser("CUSTOMER");
    const order = await createOrder(customer, coachingOrder);
    const svc = await db.service.findUniqueOrThrow({ where: { slug: "valorant-coaching" } });
    const rule = await db.pricingRule.findFirstOrThrow({ where: { serviceId: svc.id, variant: null, unit: "HOUR" } });
    await db.pricingRule.update({ where: { id: rule.id }, data: { amountCents: 9999 } });
    try {
      const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(fresh.minPriceCents).toBe(order.minPriceCents);
    } finally {
      await db.pricingRule.update({ where: { id: rule.id }, data: { amountCents: rule.amountCents } });
    }
  });

  it("rejects a budget below the minimum", async () => {
    const customer = await makeUser("CUSTOMER");
    await expect(createOrder(customer, { ...coachingOrder, budgetCents: 100 })).rejects.toThrow(/budget/);
  });

  it("only approved providers can bid", async () => {
    const customer = await makeUser("CUSTOMER");
    const pending = await makeUser("PROVIDER", "PENDING");
    const order = await createOrder(customer, coachingOrder);
    await expect(submitOffer(pending, order.id, offer(10000))).rejects.toThrow(/approved/);
  });

  it("refuses orders for services pending compliance review", async () => {
    const customer = await makeUser("CUSTOMER");
    await expect(
      createOrder(customer, {
        serviceSlug: "valorant-solo-rank-up",
        region: "NA",
        details: { currentRank: "Gold 1", desiredRank: "Gold 3", queue: "Competitive", preferences: [], timeframeDays: 5 },
        publish: true,
      }),
    ).rejects.toThrow(/not currently available|compliance/);
  });
});

describe("offer acceptance and payment", () => {
  it("closes competing offers, snapshots commission and assigns only after verified payment", async () => {
    const customer = await makeUser("CUSTOMER");
    const p1 = await makeUser("PROVIDER", "APPROVED");
    const p2 = await makeUser("PROVIDER", "APPROVED");
    const order = await createOrder(customer, coachingOrder);
    const o1 = await submitOffer(p1, order.id, offer(8000));
    const o2 = await submitOffer(p2, order.id, offer(6000));
    // Customer chooses the more expensive provider — no auto-award to the lowest bid.
    await acceptOffer(customer, o1.id);
    let fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.status).toBe("AWAITING_PAYMENT");
    expect(fresh.agreedPriceCents).toBe(8000);
    expect(fresh.platformFeeCents).toBe(640); // $80 order → 8%
    expect(fresh.providerNetCents).toBe(7360);
    expect((await db.offer.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe("DECLINED");
    await expect(acceptOffer(customer, o2.id)).rejects.toThrow();
    await expect(startOrder(p1, order.id)).rejects.toThrow(); // cannot start before payment

    const payment = await payOrder(order.id, customer);
    fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.status).toBe("ASSIGNED");
    // Duplicate webhook delivery is a no-op.
    await handlePaymentSucceeded({ eventId: `evt_${payment.id}`, provider: "sandbox", paymentId: payment.id, amountCents: 8000, paymentIntentId: null, payload: {} });
    expect(await db.ledgerEntry.count({ where: { orderId: order.id } })).toBe(3);
  });

  it("rejects a payment event whose amount does not match", async () => {
    const customer = await makeUser("CUSTOMER");
    const provider = await makeUser("PROVIDER", "APPROVED");
    const order = await createOrder(customer, coachingOrder);
    const o = await submitOffer(provider, order.id, offer(7000));
    await acceptOffer(customer, o.id);
    await startCheckout(customer, order.id);
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(
      handlePaymentSucceeded({ eventId: `evt_bad_${payment.id}`, provider: "sandbox", paymentId: payment.id, amountCents: 1, paymentIntentId: null, payload: {} }),
    ).rejects.toThrow(/mismatch/);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_PAYMENT");
  });

  it("refunds a payment that arrives after the customer cancelled", async () => {
    const customer = await makeUser("CUSTOMER");
    const provider = await makeUser("PROVIDER", "APPROVED");
    const order = await createOrder(customer, coachingOrder);
    const o = await submitOffer(provider, order.id, offer(7000));
    await acceptOffer(customer, o.id);
    await startCheckout(customer, order.id);
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await cancelOrder(customer, order.id, "changed my mind");
    await handlePaymentSucceeded({ eventId: `evt_late_${payment.id}`, provider: "sandbox", paymentId: payment.id, amountCents: 7000, paymentIntentId: null, payload: {} });
    const p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("REFUNDED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
  });

  it("lets the customer change selection before paying", async () => {
    const customer = await makeUser("CUSTOMER");
    const p1 = await makeUser("PROVIDER", "APPROVED");
    const p2 = await makeUser("PROVIDER", "APPROVED");
    const order = await createOrder(customer, coachingOrder);
    const o1 = await submitOffer(p1, order.id, offer(8000));
    const o2 = await submitOffer(p2, order.id, offer(9000));
    await acceptOffer(customer, o1.id);
    await changeSelection(customer, order.id);
    await acceptOffer(customer, o2.id);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.providerId).toBe(p2.id);
  });
});

describe("full lifecycle", () => {
  it("completes, releases earnings, allows one verified review and a payout", async () => {
    const { customer, provider, order } = await assignedOrder();
    await expect(confirmCompletion(customer, order.id)).rejects.toThrow();
    await startOrder(provider, order.id);
    await submitCompletion(provider, order.id, "Two sessions done, notes shared.");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_CUSTOMER_CONFIRMATION");
    await expect(createReview(customer, order.id, 5, "Great coach, very clear.")).rejects.toThrow(/completed/);
    await expect(confirmCompletion(provider, order.id)).rejects.toThrow();
    await confirmCompletion(customer, order.id);

    const bal = await providerBalances(provider.id);
    expect(bal.available).toBe(5520); // $60 agreed − 8%
    expect(bal.pending).toBe(0);

    await createReview(customer, order.id, 5, "Great coach, very clear.");
    await expect(createReview(customer, order.id, 4, "Trying to review twice")).rejects.toThrow(/already/);

    const payout = await requestPayout(provider);
    expect(payout.amountCents).toBe(5520);
    expect((await providerBalances(provider.id)).available).toBe(0);
    await expect(requestPayout(provider)).rejects.toThrow(/no available/);
  });

  it("keeps messaging private to the parties", async () => {
    const { customer, provider, order } = await assignedOrder();
    const outsider = await makeUser("PROVIDER", "APPROVED");
    await sendMessage(customer, order.id, "Hi! When can we start?");
    await expect(sendMessage(outsider, order.id, "hello")).rejects.toThrow(/access/);
    await expect(listMessages(outsider, order.id)).rejects.toThrow(/access/);
    const msgs = await listMessages(provider, order.id);
    expect(msgs).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: provider.id, type: "NEW_MESSAGE" } })).toBe(1);
  });
});

describe("cancellations and disputes", () => {
  it("refunds when the other party accepts a cancellation request", async () => {
    const { customer, provider, order } = await assignedOrder();
    await requestCancellation(customer, order.id, "Schedule conflict");
    await expect(acceptCancellation(customer, order.id)).rejects.toThrow(/other party/);
    await acceptCancellation(provider, order.id);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
    expect(fresh.status).toBe("REFUNDED");
    expect(fresh.payments[0].status).toBe("REFUNDED");
    expect((await providerBalances(provider.id)).pending).toBe(0);
  });

  it("holds disputed funds until an admin resolves", async () => {
    const { customer, provider, order } = await assignedOrder();
    const admin = await makeUser("ADMIN");
    await startOrder(provider, order.id);
    await submitCompletion(provider, order.id, "All sessions delivered as agreed.");
    await openDispute(customer, order.id, "Second session never happened.");
    expect((await providerBalances(provider.id)).held).toBe(5520);
    await expect(requestPayout(provider)).rejects.toThrow();
    await expect(resolveDisputeRelease(customer, order.id, "nope")).rejects.toThrow(/Admins/);
    await resolveDisputeRelease(admin, order.id, "Session logs confirm delivery.");
    expect((await providerBalances(provider.id)).available).toBe(5520);
  });

  it("admin can refund a dispute", async () => {
    const { customer, provider, order } = await assignedOrder();
    const admin = await makeUser("ADMIN");
    await openDispute(provider, order.id, "Customer never showed up to sessions.");
    await resolveDisputeRefund(admin, order.id, "Refund approved");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    expect((await providerBalances(provider.id)).held).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: order.id, action: "dispute.refund" } })).toBe(1);
    void customer;
  });
});
