import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, parseDollars } from "@/lib/money";
import { REGIONS, TIERS, tierOf } from "@/lib/valorant";
import { Card, EmptyState, LinkButton, Notice, PageHeader, Pagination, RankChip, ServiceBadge, StatusBadge, btnClass, fmtDate, timeAgo } from "@/components/ui";

export const metadata = { title: "Available orders" };
const PER_PAGE = 20;

export default async function AvailableOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (viewer.role !== "PROVIDER") return <Card><EmptyState title="Provider accounts only" /></Card>;
  if (viewer.providerStatus !== "APPROVED")
    return (
      <>
        <PageHeader title="Available orders" />
        <Notice tone="warn">Only approved providers can view and bid on paid orders. <Link href="/dashboard/apply" className="underline">Check your application</Link>.</Notice>
      </>
    );
  const sp = await searchParams;
  const profile = await db.providerProfile.findUniqueOrThrow({ where: { userId: viewer.id } });
  const services = await db.service.findMany({ where: { slug: { in: profile.supportedServices } }, orderBy: { sortOrder: "asc" } });
  const minBudget = parseDollars(sp.minBudget ?? "");
  const deadlineDays = Number(sp.deadline) || undefined;

  const where: Prisma.OrderWhereInput = {
    status: { in: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"] },
    customerId: { not: viewer.id },
    service: { slug: sp.service ? sp.service : { in: profile.supportedServices } },
    ...(sp.region ? { region: sp.region } : sp.all ? {} : { region: { in: profile.regions } }),
    ...(sp.mine === "1" ? {} : { offers: { none: { providerId: viewer.id } } }),
    ...(minBudget && !Number.isNaN(minBudget) ? { OR: [{ budgetCents: { gte: minBudget } }, { minPriceCents: { gte: minBudget } }] } : {}),
    ...(deadlineDays ? { deadline: { lte: new Date(Date.now() + deadlineDays * 86400_000) } } : {}),
    ...(sp.tier ? { details: { path: ["currentRank"], string_starts_with: sp.tier } } : {}),
  };
  const sort: Prisma.OrderOrderByWithRelationInput =
    sp.sort === "price" ? { minPriceCents: "desc" } : sp.sort === "deadline" ? { deadline: { sort: "asc", nulls: "last" } } : { publishedAt: "desc" };
  const page = Math.max(1, Number(sp.page) || 1);
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: sort,
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { service: true, customer: { select: { displayName: true } }, _count: { select: { offers: { where: { status: "ACTIVE" } } } } },
    }),
    db.order.count({ where }),
  ]);
  const qs = (p: number) => `/dashboard/available?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Available orders" subtitle="Orders matching your services. Offers must be at or above each order's minimum price." />
      <Card className="mb-4">
        <form className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">
          <div>
            <label className="label" htmlFor="service">Service</label>
            <select id="service" name="service" defaultValue={sp.service ?? ""} className="input">
              <option value="">My services</option>
              {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="region">Region</label>
            <select id="region" name="region" defaultValue={sp.region ?? ""} className="input">
              <option value="">My regions</option>
              {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tier">Difficulty (rank)</label>
            <select id="tier" name="tier" defaultValue={sp.tier ?? ""} className="input">
              <option value="">Any</option>
              {TIERS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="minBudget">Min. value ($)</label>
            <input id="minBudget" name="minBudget" inputMode="decimal" defaultValue={sp.minBudget ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="deadline">Deadline within</label>
            <select id="deadline" name="deadline" defaultValue={sp.deadline ?? ""} className="input">
              <option value="">Any</option>
              <option value="1">24 hours</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sort">Sort</label>
            <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="input">
              <option value="">Newest</option>
              <option value="price">Highest minimum</option>
              <option value="deadline">Soonest deadline</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button className={btnClass("primary")}>Apply</button>
            <Link href="/dashboard/available" className={btnClass("ghost")}>Reset</Link>
          </div>
        </form>
      </Card>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No orders match" body="Try widening your filters, or add services and regions to your profile." action={<LinkButton href="/dashboard/profile" variant="secondary">Edit profile</LinkButton>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[900px]">
              <thead>
                <tr><th>Order</th><th>Service</th><th>Target</th><th>Region</th><th>Status</th><th className="text-right">Minimum</th><th className="text-right">Budget</th><th>Deadline</th><th className="text-right">Offers</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const d = o.details as Record<string, string>;
                  let tierLabel = "";
                  try { tierLabel = tierOf(d.currentRank); } catch {}
                  return (
                    <tr key={o.id} className="relative">
                      <td>
                        <Link href={`/dashboard/orders/${o.id}`} className="after:absolute after:inset-0">
                          <span className="font-mono text-xs text-faint">#{o.number} · {timeAgo(o.publishedAt ?? o.createdAt)}</span>
                          <span className="block font-medium">{o.title}</span>
                        </Link>
                      </td>
                      <td><ServiceBadge kind={o.service.kind} /></td>
                      <td>{d.desiredRank || d.targetRank ? <RankChip rank={d.desiredRank ?? d.targetRank} /> : <span className="text-sm text-muted">{tierLabel}</span>}</td>
                      <td>{o.region}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="text-right font-semibold tabular-nums">{formatCents(o.minPriceCents)}</td>
                      <td className="text-right text-muted tabular-nums">{o.budgetCents ? formatCents(o.budgetCents) : "—"}</td>
                      <td className="text-xs text-muted">{o.deadline ? fmtDate(o.deadline) : "Flexible"}</td>
                      <td className="text-right">{o._count.offers}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={qs} />
      </Card>
    </>
  );
}
