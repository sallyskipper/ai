import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader, StatCard, fmtDate } from "@/components/ui";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const viewer = await requireViewer();
  const payments = await db.payment.findMany({
    where: { order: { customerId: viewer.id }, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { id: true, number: true, title: true } }, refunds: true },
  });
  const paid = payments.filter((p) => ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status)).reduce((a, p) => a + p.amountCents, 0);
  const refunded = payments.reduce((a, p) => a + p.refundedCents, 0);
  return (
    <>
      <PageHeader title="Payments" subtitle="Your payment and refund history. Card details are handled by our payment provider and never stored by Redline." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total paid" value={formatCents(paid)} />
        <StatCard label="Refunded" value={formatCents(refunded)} />
        <StatCard label="Net spend" value={formatCents(paid - refunded)} accent />
      </div>
      <Card>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" body="Payments appear here after you pay for an order." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[640px]">
              <thead><tr><th>Date</th><th>Order</th><th>Status</th><th className="text-right">Amount</th><th className="text-right">Refunded</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-muted">{fmtDate(p.createdAt)}</td>
                    <td><Link href={`/dashboard/orders/${p.order.id}`} className="hover:text-red-hot"><span className="font-mono text-xs text-faint">#{p.order.number}</span> {p.order.title}</Link></td>
                    <td><Badge tone={p.status === "SUCCEEDED" ? "green" : p.status === "FAILED" ? "gray" : "blue"}>{p.status.toLowerCase().replace("_", " ")}</Badge>{p.provider === "sandbox" && <Badge tone="amber" className="ml-1">sandbox</Badge>}</td>
                    <td className="text-right tabular-nums">{formatCents(p.amountCents)}</td>
                    <td className="text-right text-muted tabular-nums">{p.refundedCents ? formatCents(p.refundedCents) : "—"}</td>
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
