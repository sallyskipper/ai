import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { providerStats } from "@/lib/domain/reviews";
import { Card, CardHeader, PageHeader, StatCard, pct } from "@/components/ui";

export const metadata = { title: "Performance" };

export default async function PerformancePage() {
  const viewer = await requireViewer();
  const since = new Date(Date.now() - 90 * 86400_000);
  const [stats, offers, accepted, gross, monthly] = await Promise.all([
    providerStats(viewer.id),
    db.offer.count({ where: { providerId: viewer.id, createdAt: { gte: since } } }),
    db.offer.count({ where: { providerId: viewer.id, status: "ACCEPTED", createdAt: { gte: since } } }),
    db.order.aggregate({ where: { providerId: viewer.id, status: "COMPLETED" }, _sum: { providerNetCents: true }, _avg: { agreedPriceCents: true } }),
    db.$queryRaw<{ month: Date; completed: bigint; net: bigint | null }[]>`
      SELECT date_trunc('month', "completedAt") AS month, COUNT(*) AS completed, SUM("providerNetCents") AS net
      FROM "Order" WHERE "providerId" = ${viewer.id} AND status = 'COMPLETED' AND "completedAt" > now() - interval '6 months'
      GROUP BY 1 ORDER BY 1`,
  ]);
  const maxNet = Math.max(1, ...monthly.map((m) => Number(m.net ?? 0)));
  return (
    <>
      <PageHeader title="Performance" subtitle="Computed from your real orders and verified reviews." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Completion rate" value={pct(stats.completionRate)} accent />
        <StatCard label="Cancellation rate" value={pct(stats.cancellationRate)} />
        <StatCard label="Average rating" value={stats.avgRating?.toFixed(2) ?? "—"} hint={`${stats.reviewCount} reviews`} />
        <StatCard label="Offer win rate (90d)" value={offers ? pct(accepted / offers) : "—"} hint={`${accepted} of ${offers} offers`} />
        <StatCard label="Completed orders" value={stats.completedOrders} />
        <StatCard label="Avg. order value" value={formatCents(gross._avg.agreedPriceCents ? Math.round(gross._avg.agreedPriceCents) : null)} />
        <StatCard label="Lifetime net earnings" value={formatCents(gross._sum.providerNetCents ?? 0)} />
        <StatCard label="Avg. offer response" value={stats.avgResponseMinutes == null ? "—" : `${Math.round(stats.avgResponseMinutes)} min`} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Net earnings by month" subtitle="Last 6 months, completed orders" />
        {monthly.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No completed orders in the last 6 months.</p>
        ) : (
          <div className="flex h-56 items-end gap-4 px-5 py-5">
            {monthly.map((m) => (
              <div key={m.month.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs tabular-nums text-muted">{formatCents(Number(m.net ?? 0))}</span>
                <div className="w-full max-w-16 rounded-t bg-red" style={{ height: `${(Number(m.net ?? 0) / maxNet) * 140}px` }} title={`${m.completed} orders`} />
                <span className="text-xs text-faint">{m.month.toLocaleDateString("en-US", { month: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
