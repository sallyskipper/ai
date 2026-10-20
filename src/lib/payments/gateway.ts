import Stripe from "stripe";

// Payment gateway abstraction. "stripe" is the real marketplace integration
// (Checkout + separate charges and transfers to Connect Express accounts).
// "sandbox" exists only for local development and is refused in production.

export type CheckoutRequest = {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  description: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export interface PaymentGateway {
  name: "stripe" | "sandbox";
  createCheckout(req: CheckoutRequest): Promise<{ url: string; externalId: string }>;
  refund(args: { paymentIntentId: string | null; externalId: string | null; amountCents: number; idempotencyKey: string }): Promise<{ externalId: string }>;
  transfer(args: { destination: string | null; amountCents: number; currency: string; idempotencyKey: string; description: string }): Promise<{ externalId: string }>;
}

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripeClient ??= new Stripe(key);
  return stripeClient;
}

const stripeGateway: PaymentGateway = {
  name: "stripe",
  async createCheckout(req) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: req.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: req.currency,
              unit_amount: req.amountCents,
              product_data: { name: `Order #${req.orderNumber}`, description: req.description.slice(0, 300) },
            },
          },
        ],
        payment_intent_data: { transfer_group: `order_${req.orderId}`, metadata: { paymentId: req.paymentId, orderId: req.orderId } },
        metadata: { paymentId: req.paymentId, orderId: req.orderId },
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout_${req.paymentId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, externalId: session.id };
  },
  async refund({ paymentIntentId, amountCents, idempotencyKey }) {
    if (!paymentIntentId) throw new Error("Payment has no payment intent to refund");
    const r = await stripe().refunds.create({ payment_intent: paymentIntentId, amount: amountCents }, { idempotencyKey });
    return { externalId: r.id };
  },
  async transfer({ destination, amountCents, currency, idempotencyKey, description }) {
    if (!destination) throw new Error("Provider has no connected payout account");
    const t = await stripe().transfers.create({ amount: amountCents, currency, destination, description }, { idempotencyKey });
    return { externalId: t.id };
  },
};

const sandboxGateway: PaymentGateway = {
  name: "sandbox",
  async createCheckout(req) {
    return { url: `${appUrl()}/checkout/sandbox/${req.paymentId}`, externalId: `sbx_cs_${req.paymentId}` };
  },
  async refund({ idempotencyKey }) {
    return { externalId: `sbx_re_${idempotencyKey}` };
  },
  async transfer({ idempotencyKey }) {
    return { externalId: `sbx_tr_${idempotencyKey}` };
  },
};

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function gatewayName(): "stripe" | "sandbox" {
  const name = process.env.PAYMENTS_PROVIDER === "stripe" ? "stripe" : "sandbox";
  if (name === "sandbox" && process.env.NODE_ENV === "production" && process.env.ALLOW_SANDBOX_IN_PRODUCTION !== "true")
    throw new Error("Sandbox payments are disabled in production. Set PAYMENTS_PROVIDER=stripe.");
  return name;
}

export function gateway(name: string = gatewayName()): PaymentGateway {
  if (name === "stripe") return stripeGateway;
  if (name === "sandbox") {
    gatewayName(); // throws in production
    return sandboxGateway;
  }
  throw new Error(`Unknown payment gateway ${name}`);
}
