import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe } from "@/lib/payments/gateway";
import { handlePaymentFailed, handlePaymentSucceeded } from "@/lib/payments/service";

// Stripe webhook. The signature is verified with STRIPE_WEBHOOK_SECRET before any
// event is trusted; handlers are idempotent on the Stripe event id.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") break; // async methods confirm later
        const paymentId = s.metadata?.paymentId;
        if (!paymentId) break;
        await handlePaymentSucceeded({
          eventId: event.id,
          provider: "stripe",
          paymentId,
          amountCents: s.amount_total ?? -1,
          paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
          payload: { sessionId: s.id, type: event.type },
        });
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.paymentId) await handlePaymentFailed(event.id, "stripe", s.metadata.paymentId, { sessionId: s.id, type: event.type });
        break;
      }
      case "account.updated": {
        const a = event.data.object as Stripe.Account;
        await db.providerProfile.updateMany({ where: { stripeAccountId: a.id }, data: { payoutsEnabled: !!a.payouts_enabled } });
        break;
      }
    }
  } catch (e) {
    console.error("Stripe webhook handling failed", event.id, e);
    // Non-2xx makes Stripe retry; handlers are idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
