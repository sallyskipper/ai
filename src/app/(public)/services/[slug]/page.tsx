import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { exampleMinimums, isBookable } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { listApprovedProviders } from "@/lib/providers-query";
import { COACHING_TYPES, ruleScopeLabel } from "@/lib/valorant";
import { ProviderCard } from "@/components/provider-card";
import { Card, CardHeader, EmptyState, LinkButton, Notice, ServiceBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const UNIT_LABEL = { DIVISION: "per division", GAME: "per game", HOUR: "per hour" } as const;

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await db.service.findUnique({
    where: { slug },
    include: { game: true, pricingRules: { where: { active: true }, orderBy: [{ unit: "asc" }, { amountCents: "asc" }] } },
  });
  if (!service) notFound();
  const bookable = isBookable(service);
  const providers = await listApprovedProviders({ service: slug, perPage: 6 });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-center gap-2 text-xs text-faint">
            <span>{service.game.name}</span>
            <span>/</span>
            <ServiceBadge kind={service.kind} />
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold">{service.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{service.description}</p>

          {!bookable && (
            <div className="mt-6">
              <Notice tone="warn">
                {service.accountOperated
                  ? "This is an account-operated service. It stays disabled until Redline completes a review of the game publisher's current rules and our payment provider's requirements. Redline never asks for or stores game passwords."
                  : "This service is temporarily unavailable."}
              </Notice>
            </div>
          )}

          {service.kind === "COACHING" && (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {COACHING_TYPES.map((c) => (
                <div key={c.code} className="card flex items-center gap-3 p-4">
                  <span className="block size-2 rotate-45 bg-red" />
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
              ))}
            </div>
          )}

          {service.kind === "DUO_RANK_UP" && (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["You play on your account", "The provider joins your party. You stay in control of your account."],
                ["Rank goal or game count", "Order a target rank, or a fixed number of games together."],
                ["Comms your way", "In-game voice, Discord, or text — choose your preference."],
              ].map(([t, b]) => (
                <div key={t} className="card p-4">
                  <p className="font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-muted">{b}</p>
                </div>
              ))}
            </div>
          )}

          <Card className="mt-8">
            <CardHeader title="Service rules" />
            <p className="px-5 py-4 text-sm whitespace-pre-line text-muted">{service.rules}</p>
          </Card>

          <h2 className="mt-12 font-display text-2xl font-semibold">Providers offering {service.name}</h2>
          {providers.items.length === 0 ? (
            <Card className="mt-4">
              <EmptyState title="No approved providers yet" body="Providers are added after our team vets them. Post an order and you'll be notified when offers arrive." />
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {providers.items.map((p) => <ProviderCard key={p.id} p={p} />)}
            </div>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Minimum accepted prices" subtitle="Set by Redline. Providers cannot bid below these." />
            <ul className="divide-y divide-line text-sm">
              {exampleMinimums({ ...service, pricingRules: service.pricingRules } as never).map((e: { label: string; cents: number | null }) => (
                <li key={e.label} className="flex justify-between px-5 py-3">
                  <span className="text-muted">{e.label}</span>
                  <span className="font-semibold tabular-nums">{formatCents(e.cents)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3 text-xs text-faint">Absolute minimum per order: {formatCents(service.floorPriceCents)}</div>
          </Card>
          <Card>
            <CardHeader title="Rate card" />
            <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
              {service.pricingRules.map((r) => (
                <li key={r.id} className="flex justify-between px-5 py-2">
                  <span className="text-muted">
                    {ruleScopeLabel(r.tier)}
                    {r.variant ? ` · ${COACHING_TYPES.find((c) => c.code === r.variant)?.name ?? r.variant}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(r.amountCents)} <span className="text-faint">{UNIT_LABEL[r.unit]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          {bookable ? (
            <LinkButton href={`/dashboard/orders/new?service=${service.slug}`} size="lg" className="w-full">Create {service.name} order</LinkButton>
          ) : (
            <button disabled className="h-12 w-full cursor-not-allowed rounded-md border border-line text-sm text-faint">Not available yet</button>
          )}
        </aside>
      </div>
    </div>
  );
}
