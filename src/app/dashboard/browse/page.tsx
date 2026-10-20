import { getCatalog, exampleMinimums, isBookable } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { listApprovedProviders } from "@/lib/providers-query";
import { ProviderCard } from "@/components/provider-card";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, ServiceBadge } from "@/components/ui";

export const metadata = { title: "Browse services" };

export default async function BrowsePage() {
  const [catalog, providers] = await Promise.all([getCatalog(), listApprovedProviders({ perPage: 6 })]);
  return (
    <>
      <PageHeader title="Browse services" subtitle="Valorant services from personally vetted providers." />
      {catalog.map((g) => (
        <div key={g.id} className="grid gap-4 lg:grid-cols-3">
          {g.services.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <div className="flex items-center justify-between px-5 pt-5">
                <ServiceBadge kind={s.kind} />
                {!isBookable(s) && <Badge tone="amber">Pending compliance review</Badge>}
              </div>
              <div className="flex-1 px-5 py-3">
                <h2 className="font-display text-lg font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm text-muted">{s.tagline}</p>
                <ul className="mt-4 space-y-1 text-sm">
                  {exampleMinimums(s).map((e) => (
                    <li key={e.label} className="flex justify-between"><span className="text-muted">{e.label}</span><span className="tabular-nums">{formatCents(e.cents)}</span></li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2 border-t border-line px-5 py-4">
                <LinkButton href={`/services/${s.slug}`} variant="secondary" size="sm">Details</LinkButton>
                {isBookable(s) && <LinkButton href={`/dashboard/orders/new?service=${s.slug}`} size="sm">Create order</LinkButton>}
              </div>
            </Card>
          ))}
        </div>
      ))}
      <Card className="mt-6">
        <CardHeader title="Vetted providers" action={<LinkButton href="/providers" variant="ghost" size="sm">Browse all</LinkButton>} />
        {providers.items.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{providers.items.map((p) => <ProviderCard key={p.id} p={p} />)}</div>
        ) : (
          <EmptyState title="No approved providers yet" />
        )}
      </Card>
    </>
  );
}
