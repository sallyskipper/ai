import Link from "next/link";
import { getCatalog, exampleMinimums, isBookable } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Badge, LinkButton, ServiceBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const ICONS: Record<string, React.ReactNode> = {
  SOLO_RANK_UP: <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4zm0 5v8m-3-5l3-3 3 3" />,
  DUO_RANK_UP: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.7-5 6-5s6 2 6 5m0-4.6c.6-.3 1.3-.4 2-.4 3.3 0 6 2 6 5" />,
  COACHING: <path d="M3 7l9-4 9 4-9 4-9-4zm3 2v5c0 2 2.7 4 6 4s6-2 6-4V9m3-2v6" />,
};

export default async function Home() {
  const [catalog, providerCount] = await Promise.all([
    getCatalog(),
    db.providerProfile.count({ where: { status: "APPROVED" } }),
  ]);
  const services = catalog.flatMap((g) => g.services);
  const duo = services.find((s) => s.kind === "DUO_RANK_UP");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="stripe-bg absolute inset-0 opacity-60" />
        <div className="absolute -top-40 right-[-10%] size-[640px] rounded-full bg-red/20 blur-[140px]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-red/30 bg-red/10 px-3 py-1 text-xs font-semibold tracking-wider text-red-hot uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-red-hot" /> Valorant marketplace
            </span>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              Climb with providers
              <br />
              we&apos;ve <span className="text-red">personally vetted.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Post your order and receive offers from approved providers — never below a fair minimum price. Compare ratings from real, completed orders and pick the provider you trust, not just the cheapest bid.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/dashboard/orders/new" size="lg">Create an order</LinkButton>
              <LinkButton href="/providers" variant="secondary" size="lg">Browse providers</LinkButton>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm">
              <div>
                <dt className="text-faint">Approved providers</dt>
                <dd className="font-display text-2xl font-semibold">{providerCount}</dd>
              </div>
              <div>
                <dt className="text-faint">Reviews</dt>
                <dd className="font-display text-2xl font-semibold">Verified only</dd>
              </div>
              <div>
                <dt className="text-faint">Payments</dt>
                <dd className="font-display text-2xl font-semibold">Held until you confirm</dd>
              </div>
            </dl>
          </div>

          {/* Live minimum price panel — values come from the current pricing rules. */}
          {duo && (
            <div className="card self-center overflow-hidden shadow-[0_30px_80px_-30px_rgba(229,9,20,0.45)]">
              <div className="flex items-center justify-between border-b border-line bg-coal px-5 py-3">
                <div className="flex items-center gap-2">
                  <ServiceBadge kind={duo.kind} />
                  <span className="text-sm font-semibold">Minimum accepted prices</span>
                </div>
                <Badge tone="green">Live</Badge>
              </div>
              <ul className="divide-y divide-line">
                {exampleMinimums(duo).map((ex) => (
                  <li key={ex.label} className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm">{ex.label}</span>
                    <span className="font-display text-lg font-semibold tabular-nums">{formatCents(ex.cents)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line bg-coal px-5 py-4 text-xs text-muted">
                Providers can bid at or above the minimum — never below. The minimum is locked to your order when you post it.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-red uppercase">Services</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Choose how you want to improve</h2>
          </div>
          <Link href="/services" className="text-sm text-muted hover:text-text">All services →</Link>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {services.map((s) => {
            const bookable = isBookable(s);
            return (
              <div key={s.id} className="card group relative flex flex-col overflow-hidden p-6 transition-all hover:-translate-y-0.5 hover:border-red/40">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-red to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-lg border border-line bg-coal text-red">
                    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {ICONS[s.kind]}
                    </svg>
                  </span>
                  {!bookable && <Badge tone="amber">Pending compliance review</Badge>}
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.name}</h3>
                <p className="mt-2 flex-1 text-sm text-muted">{s.tagline}</p>
                <p className="mt-5 text-xs text-faint">
                  Minimum from <span className="font-semibold text-text">{formatCents(s.floorPriceCents)}</span>
                </p>
                <div className="mt-4 flex gap-2">
                  <LinkButton href={`/services/${s.slug}`} variant="secondary" size="sm">Details</LinkButton>
                  {bookable && <LinkButton href={`/dashboard/orders/new?service=${s.slug}`} size="sm">Create order</LinkButton>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-coal">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-red uppercase">How it works</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">Fair offers. Your choice. Protected payment.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              ["Post your order", "Pick a service and your goals. You see the minimum accepted price before you submit."],
              ["Receive offers", "Approved providers bid at or above the minimum, with their ETA and a short pitch."],
              ["Choose your provider", "Compare verified ratings, completion rate and experience. Pick who you trust."],
              ["Confirm & review", "Funds are released only after you confirm completion. Then leave a verified review."],
            ].map(([t, b], i) => (
              <li key={t} className="card p-5">
                <span className="font-display text-3xl font-bold text-red/80">0{i + 1}</span>
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Personally vetted providers", "Every provider is reviewed by our team before they can bid on paid orders. Suspicious accounts are suspended."],
            ["No race to the bottom", "Administrator-set minimum prices protect providers from undercutting — so the job is always worth doing well."],
            ["Reviews you can trust", "Only customers with a completed order can review, once per order. We investigate abusive or fraudulent reviews."],
          ].map(([t, b]) => (
            <div key={t} className="flex gap-4">
              <span className="mt-1 block size-2.5 shrink-0 rotate-45 bg-red" />
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{b}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="card stripe-bg mt-16 flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold">Are you a high-rank player or coach?</h2>
            <p className="mt-1 text-muted">Apply to become a vetted provider. Bid on orders with guaranteed minimum prices.</p>
          </div>
          <LinkButton href="/register?type=provider" variant="outline" size="lg">Apply as provider</LinkButton>
        </div>
      </section>
    </>
  );
}
