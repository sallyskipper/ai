import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { OrderTable, orderRowInclude } from "@/components/order-table";
import { Card, CardHeader, LinkButton, PageHeader, StatCard, fmtDate } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function AdminOverview() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [users, providers, apps, openOrders, activeOrders, disputes, gmv, fees, refunds, recentOrders, recentAudit, failedRefunds] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: true }),
    db.providerProfile.groupBy({ by: ["status"], _count: true }),
    db.providerApplication.count({ where: { status: "SUBMITTED" } }),
    db.order.count({ where: { status: { in: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"] } } }),
    db.order.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS", "AWAITING_CUSTOMER_CONFIRMATION", "COMPLETION_SUBMITTED"] } } }),
    db.dispute.count({ where: { status: "OPEN" } }),
    db.payment.aggregate({ where: { status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"] }, createdAt: { gte: since } }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { type: "PLATFORM_FEE", status: "SETTLED", createdAt: { gte: since } }, _sum: { amountCents: true } }),
    db.refund.aggregate({ where: { status: "succeeded", createdAt: { gte: since } }, _sum: { amountCents: true } }),
    db.order.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: orderRowInclude }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { displayName: true } } } }),
    db.refund.count({ where: { status: { in: ["failed", "pending"] } } }),
  ]);
  const role = (r: string) => users.find((u) => u.role === r)?._count ?? 0;
  const prov = (s: string) => providers.find((p) => p.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Last 30 days unless noted." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Customers" value={role("CUSTOMER")} href="/admin/users?role=CUSTOMER" />
        <StatCard label="Approved providers" value={prov("APPROVED")} hint={`${prov("SUSPENDED")} suspended`} href="/admin/users?role=PROVIDER" />
        <StatCard label="Pending applications" value={apps} href="/admin/applications" accent={apps > 0} />
        <StatCard label="Open orders" value={openOrders} href="/admin/orders?status=open" />
        <StatCard label="Active orders" value={activeOrders} href="/admin/orders?status=active" />
        <StatCard label="Open disputes" value={disputes} href="/admin/disputes" accent={disputes > 0} />
        <StatCard label="Gross volume (30d)" value={formatCents(gmv._sum.amountCents ?? 0)} href="/admin/payments" />
        <StatCard label="Settled fees (30d)" value={formatCents(fees._sum.amountCents ?? 0)} />
        <StatCard label="Refunds (30d)" value={formatCents(refunds._sum.amountCents ?? 0)} />
        <StatCard label="Refunds needing attention" value={failedRefunds} href="/admin/payments" accent={failedRefunds > 0} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Recently updated orders" action={<LinkButton href="/admin/orders" variant="ghost" size="sm">All orders</LinkButton>} />
          <OrderTable orders={recentOrders} show="both" />
        </Card>
        <Card>
          <CardHeader title="Recent admin & system activity" action={<LinkButton href="/admin/audit" variant="ghost" size="sm">Audit log</LinkButton>} />
          <ul className="divide-y divide-line text-sm">
            {recentAudit.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <p className="font-mono text-xs text-red-hot">{a.action}</p>
                <p className="mt-0.5 text-muted">{a.actor?.displayName ?? "System"} · {a.entityType} <Link href={`/admin/audit?entity=${a.entityId}`} className="font-mono text-xs hover:text-text">{a.entityId.slice(0, 10)}…</Link></p>
                <p className="text-xs text-faint">{fmtDate(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
