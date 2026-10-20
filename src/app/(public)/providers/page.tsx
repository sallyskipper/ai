import { listApprovedProviders } from "@/lib/providers-query";
import { db } from "@/lib/db";
import { REGIONS } from "@/lib/valorant";
import { ProviderCard } from "@/components/provider-card";
import { Card, EmptyState, Pagination, btnClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const services = await db.service.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } });
  const { items, pages, page, total } = await listApprovedProviders({
    service: sp.service || undefined,
    region: sp.region || undefined,
    page: Number(sp.page) || 1,
  });
  const qs = (p: number) => `/providers?${new URLSearchParams({ ...(sp.service ? { service: sp.service } : {}), ...(sp.region ? { region: sp.region } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.2em] text-red uppercase">Vetted providers</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Browse providers</h1>
      <p className="mt-2 max-w-2xl text-muted">Every provider here was approved by our team. Ratings and stats come only from completed Redline orders.</p>

      <form className="mt-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="service">Service</label>
          <select id="service" name="service" defaultValue={sp.service ?? ""} className="input w-52">
            <option value="">All services</option>
            {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="region">Region</label>
          <select id="region" name="region" defaultValue={sp.region ?? ""} className="input w-44">
            <option value="">All regions</option>
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </div>
        <button className={btnClass("secondary")}>Filter</button>
        <span className="ml-auto text-sm text-faint">{total} provider{total === 1 ? "" : "s"}</span>
      </form>

      {items.length === 0 ? (
        <Card className="mt-8"><EmptyState title="No providers match" body="Try another service or region." /></Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => <ProviderCard key={p.id} p={p} />)}
        </div>
      )}
      <div className="mt-6"><Pagination page={page} pages={pages} hrefFor={qs} /></div>
    </div>
  );
}
