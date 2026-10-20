import { getCatalog, exampleMinimums, isBookable } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { Badge, LinkButton, ServiceBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const catalog = await getCatalog();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {catalog.map((game) => (
        <section key={game.id}>
          <p className="text-xs font-semibold tracking-[0.2em] text-red uppercase">{game.name}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Services</h1>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {game.services.map((s) => (
              <div key={s.id} className="card flex flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <ServiceBadge kind={s.kind} />
                  {!isBookable(s) && <Badge tone="amber">Not yet available</Badge>}
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold">{s.name}</h2>
                <p className="mt-2 text-sm text-muted">{s.description}</p>
                <div className="mt-5 rounded-lg border border-line bg-coal">
                  <p className="border-b border-line px-4 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Example minimum prices</p>
                  <ul className="divide-y divide-line text-sm">
                    {exampleMinimums(s).map((e) => (
                      <li key={e.label} className="flex justify-between px-4 py-2">
                        <span className="text-muted">{e.label}</span>
                        <span className="font-semibold tabular-nums">{formatCents(e.cents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto flex gap-2 pt-6">
                  <LinkButton href={`/services/${s.slug}`} variant="secondary" size="sm">View details</LinkButton>
                  {isBookable(s) && <LinkButton href={`/dashboard/orders/new?service=${s.slug}`} size="sm">Create order</LinkButton>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
