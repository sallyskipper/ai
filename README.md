# Redline — Valorant services marketplace

A red-and-black Valorant marketplace with personally vetted providers, administrator-set minimum prices, customer-chosen offers (no auto-award to the lowest bid), verified reviews, order messaging, and a payments/payouts ledger.

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · Tailwind CSS v4 · PostgreSQL + Prisma · Stripe (Checkout + Connect) · Vitest + Playwright.

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL
npm install
npm run db:migrate              # applies prisma/migrations
npm run db:seed                 # catalog, pricing rules, settings, admin (+ demo accounts outside production)
npm run dev                     # http://localhost:3000
```

Dev accounts (created only when `NODE_ENV !== "production"`):

| Role | Email | Password |
| --- | --- | --- |
| Customer | customer@redline.local | Password123! |
| Provider (approved) | provider@redline.local | Password123! |
| Admin | admin@redline.local | ChangeMe!123 (set `ADMIN_PASSWORD` in production) |

The seed creates **no reviews or ratings**. All ratings, completion rates and stats are computed from real orders.

## Tests

```bash
npm test            # unit + integration tests against a real Postgres (TEST_DATABASE_URL, default redline_test)
npm run test:e2e    # browser smoke test of the full lifecycle; needs `npm run dev` running with demo accounts
npm run typecheck && npm run lint
```

Integration tests cover: server-side minimum-price enforcement, pricing snapshots surviving rule changes, approved-only bidding, compliance-gated services, competing-offer closure, commission snapshots, payment idempotency and amount checks, late-payment auto-refund, cancellation refunds, dispute holds and admin resolution, verified/unique reviews, payouts, and private messaging.

## Architecture

```
src/lib/domain/        Pure business rules + DB operations (used by actions and tests)
  order-machine.ts     Explicit order state machine (who may move an order from which state to which)
  transition.ts        Applies transitions with optimistic locking + timeline events
  pricing.ts           Minimum-price engine (per division / game / hour, tier & variant specific, service floor)
  orders.ts            Create/publish, offers, accept, start, complete, confirm, cancel, dispute
  messages.ts          Order conversations, attachments, unread tracking
  reviews.ts           Verified reviews, responses, moderation, provider stats
  providers.ts         Applications, approval/suspension, profiles, favorites
src/lib/payments/      Gateway (Stripe | sandbox), checkout, webhook handlers, refunds, ledger, payouts
src/actions/           Server actions — each re-checks the session and role
src/app/               Public marketplace, /dashboard (customer + provider), /admin, API routes
prisma/                Schema, migrations, seed
```

### Order lifecycle

`Draft → Open for Offers → Offers Received → Awaiting Payment → Assigned → In Progress → Completion Submitted → Awaiting Confirmation → Completed`, with `Cancellation Requested`, `Cancelled`, `Disputed` and `Refunded` branches. Every transition goes through `planTransition` on the server inside a transaction; the browser can't skip payment, confirmation or dispute safeguards.

- Accepting an offer reserves the provider, closes competing offers, and snapshots agreed price + commission. The provider is assigned **only after payment is verified** (Stripe webhook with signature check, or the dev sandbox calling the same handler).
- Funds are released to the provider's available balance only after the customer confirms completion (or an admin resolves a dispute in the provider's favour). Disputes put earnings on hold.
- Before payment the customer can cancel freely or reopen selection. After payment, cancellation requires the other party's agreement (full refund) or a dispute.

### Minimum prices

Admins configure rules per service (`/admin/pricing`): per-division rates by rank tier (Solo/Duo), per-game rates (Duo), and hourly rates by coaching type, plus a per-service floor. Rank-up services are priced one division at a time from a ladder (`src/lib/rank-ladder.ts`): for example Iron 1 → Iron 2 is $6, Silver 3 → Gold 1 is $12, Ascendant 1 → Ascendant 2 is $25, Immortal 1 → Immortal 2 is $70 and Immortal 3 → Radiant is $150. A single-division rule overrides its whole-tier rule, and every step is editable in admin. The minimum is shown live while creating an order, recomputed and **stored on the order** at creation (`minPriceCents` + `pricingSnapshot`), and enforced on the server for every offer.

## Payments

The site keeps a **5–10% commission** on each order on a sliding scale: 10% under $50, 8% from $50 to $149.99, and 5% from $150 up (editable in Admin → Commission & fees). The rate is locked onto the order when the customer accepts an offer. The provider's share becomes withdrawable once the customer confirms completion, and providers withdraw from **Dashboard → Payouts**.

`PAYMENTS_PROVIDER=sandbox` (default) is for local development only: no money moves, everything is labelled "sandbox", and the app refuses to use it when `NODE_ENV=production`.

For real payments set `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at `/api/webhooks/stripe` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `account.updated`.

The flow uses separate charges and transfers: customers pay the platform through Checkout, and providers are paid by transfers to their Connect Express accounts once earnings are available. Webhook events are deduplicated by event id. Refunds and transfers use idempotency keys, and every movement is recorded in `LedgerEntry` and the audit log.

> **Eligibility:** Before going live, confirm with Stripe (or your chosen provider) that game boosting or coaching marketplaces are allowed under its restricted-business policies, and set up Connect for your platform country.

## Compliance

- **Solo Rank Up is an account-operated service and is disabled.** It can't be ordered or enabled until an admin records a compliance review (`/admin/services`) covering the game publisher's current rules and the payment provider's requirements. Riot Games' terms generally forbid account sharing, so expect this review to keep the service off.
- Redline never asks for, stores or transmits game passwords. Forms and chat warn users not to share credentials.
- Duo Rank Up (customer plays on their own account) and Coaching work on their own.

## Known gaps / next steps

- Real-time updates use polling (messages every 4 s, notifications every 15 s). Swap in websockets/SSE or Supabase Realtime for scale.
- Attachments are stored on local disk (`storage/`). Use object storage (S3/R2) when deploying to more than one instance.
- No email delivery, login rate limiting, email verification or 2FA yet.
- Customer auto-confirmation after N days of provider completion isn't implemented (needs a scheduled job).
- The Eldorado.gg dashboard couldn't be reached from the build environment, so the navigation and notification patterns follow common marketplace-dashboard conventions rather than a direct inspection.
