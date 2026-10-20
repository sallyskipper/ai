import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { providerBalances } from "@/lib/payments/service";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, fmtDate } from "@/components/ui";

export const metadata = { title: "Earnings" };

const STATUS_TONE = { PENDING: "amber", HELD: "red", AVAILABLE: "green", PAID: "blue", REVERSED: "gray", SETTLED: "gray" } as const;

export default async function EarningsPage() {
  const viewer = await requireViewer();
  const [b, entries, fees] = await Promise.all([
    providerBalances(viewer.id),
    db.ledgerEntry.findMany({ where: { userId: viewer.id, type: { in: ["PROVIDER_EARNING", "PAYOUT", "ADJUSTMENT"] } }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, number: true, agreedPriceCents: true, platformFeeCents: true } } } }),
    db.order.aggregate({ where: { providerId: viewer.id, status: "COMPLETED" }, _sum: { platformFeeCents: true } }),
  ]);
  return (
    <>
      <PageHeader title="Earnings" subtitle="Earnings come from verified payments and are released when the customer confirms completion." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Pending" value={formatCents(b.pending)} hint="Awaiting confirmation" />
        <StatCard label="Held" value={formatCents(b.held)} hint="Disputed — under review" />
        <StatCard label="Available" value={formatCents(b.available)} hint="Ready to withdraw" href="/dashboard/payouts" accent />
        <StatCard label="Paid out" value={formatCents(b.paid)} />
        <StatCard label="Platform fees" value={formatCents(fees._sum.platformFeeCents ?? 0)} hint="On completed orders" />
        <StatCard label="Refunds & reversals" value={formatCents(b.reversed)} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Ledger" subtitle="Every entry is tied to a verified payment, refund or payout." />
        {entries.length === 0 ? (
          <EmptyState title="No earnings yet" body="Your earnings appear here when a customer pays for an order assigned to you." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[700px]">
              <thead><tr><th>Date</th><th>Description</th><th>Order</th><th>Status</th><th className="text-right">Gross</th><th className="text-right">Fee</th><th className="text-right">Net</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-muted">{fmtDate(e.createdAt)}</td>
                    <td>{e.description}</td>
                    <td>{e.order ? <Link href={`/dashboard/orders/${e.order.id}`} className="font-mono text-xs hover:text-red-hot">#{e.order.number}</Link> : "—"}</td>
                    <td><Badge tone={STATUS_TONE[e.status]}>{e.type === "PAYOUT" ? "payout" : e.status.toLowerCase()}</Badge></td>
                    <td className="text-right text-muted tabular-nums">{e.type === "PROVIDER_EARNING" ? formatCents(e.order?.agreedPriceCents) : "—"}</td>
                    <td className="text-right text-muted tabular-nums">{e.type === "PROVIDER_EARNING" ? `− ${formatCents(e.order?.platformFeeCents)}` : "—"}</td>
                    <td className={`text-right font-semibold tabular-nums ${e.type === "PAYOUT" ? "text-muted" : ""}`}>{e.type === "PAYOUT" ? `− ${formatCents(e.amountCents)}` : formatCents(e.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
