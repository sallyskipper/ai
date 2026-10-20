import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { adminCancelOrderAction, resolveDisputeAction } from "@/actions/admin";
import { ConfirmAction } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Tabs, btnClass, fmtDate } from "@/components/ui";

export const metadata = { title: "Cancellations & disputes" };

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "open" } = await searchParams;
  const [open, resolved, cancellations] = await Promise.all([
    db.dispute.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, include: { openedBy: { select: { displayName: true } }, order: { include: { customer: { select: { displayName: true } }, provider: { select: { displayName: true } } } } } }),
    tab === "resolved" ? db.dispute.findMany({ where: { status: { not: "OPEN" } }, orderBy: { resolvedAt: "desc" }, take: 50, include: { openedBy: { select: { displayName: true } }, order: { include: { customer: { select: { displayName: true } }, provider: { select: { displayName: true } } } } } }) : [],
    db.order.findMany({ where: { status: "CANCELLATION_REQUESTED" }, orderBy: { updatedAt: "asc" }, include: { customer: { select: { displayName: true, id: true } }, provider: { select: { displayName: true } } } }),
  ]);
  const list = tab === "resolved" ? resolved : open;
  return (
    <>
      <PageHeader title="Cancellations & disputes" subtitle="Disputed funds are never released automatically." />
      <Tabs active={tab} tabs={[{ key: "open", label: "Open disputes", href: "?tab=open", count: open.length }, { key: "cancellations", label: "Cancellation requests", href: "?tab=cancellations", count: cancellations.length }, { key: "resolved", label: "Resolved", href: "?tab=resolved" }]} />
      {tab === "cancellations" ? (
        <Card>
          {cancellations.length === 0 ? <EmptyState title="No pending cancellation requests" /> : (
            <ul className="divide-y divide-line">
              {cancellations.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
                  <span className="font-mono text-xs text-faint">#{o.number}</span>
                  <span className="flex-1">{o.title}<span className="block text-xs text-muted">Requested by {o.cancelRequestedById === o.customer.id ? `customer ${o.customer.displayName}` : `provider ${o.provider?.displayName}`}: “{o.cancelReason}”</span></span>
                  <span className="tabular-nums">{formatCents(o.agreedPriceCents)}</span>
                  <Link href={`/dashboard/orders/${o.id}?tab=messages`} className={btnClass("ghost", "sm")}>Messages</Link>
                  <ConfirmAction action={adminCancelOrderAction} hidden={{ orderId: o.id }} size="sm" label="Approve & refund" title="Approve cancellation?" body={<p>Customer is refunded {formatCents(o.agreedPriceCents)} in full.</p>} reason confirmLabel="Approve & refund" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : list.length === 0 ? (
        <Card><EmptyState title="Nothing here" /></Card>
      ) : (
        <div className="space-y-4">
          {list.map((d) => (
            <Card key={d.id}>
              <CardHeader
                title={<span className="flex items-center gap-2"><span className="font-mono text-xs text-faint">#{d.order.number}</span>{d.order.title}</span>}
                subtitle={`Opened by ${d.openedBy.displayName} · ${fmtDate(d.createdAt)}`}
                action={d.status === "OPEN" ? <StatusBadge status={d.order.status} /> : <Badge tone={d.status === "RESOLVED_REFUND" ? "blue" : "green"}>{d.status === "RESOLVED_REFUND" ? "refunded" : "released"}</Badge>}
              />
              <div className="grid gap-4 px-5 py-4 text-sm md:grid-cols-3">
                <div><p className="label">Customer</p>{d.order.customer.displayName}</div>
                <div><p className="label">Provider</p>{d.order.provider?.displayName ?? "—"}</div>
                <div><p className="label">Amount at stake</p>{formatCents(d.order.agreedPriceCents)} <span className="text-faint">(provider net {formatCents(d.order.providerNetCents)})</span></div>
                <div className="md:col-span-3"><p className="label">Reason</p><p className="text-muted">{d.reason}</p></div>
                {d.resolution && <div className="md:col-span-3"><p className="label">Resolution</p><p className="text-muted">{d.resolution}</p></div>}
              </div>
              {d.status === "OPEN" && (
                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                  <Link href={`/dashboard/orders/${d.orderId}?tab=messages`} className={btnClass("secondary", "sm")}>Review messages & evidence</Link>
                  <ConfirmAction action={resolveDisputeAction} hidden={{ orderId: d.orderId, outcome: "refund" }} size="sm" label="Refund customer" title="Resolve with full refund?" body={<p>{formatCents(d.order.agreedPriceCents)} is refunded to the customer and the provider earning is reversed.</p>} reason reasonRequired reasonLabel="Resolution (shared with both parties)" confirmLabel="Refund customer" />
                  <ConfirmAction action={resolveDisputeAction} hidden={{ orderId: d.orderId, outcome: "release" }} variant="secondary" size="sm" label="Release to provider" title="Resolve in provider's favour?" body={<p>The order is completed and {formatCents(d.order.providerNetCents)} becomes available to the provider.</p>} reason reasonRequired reasonLabel="Resolution (shared with both parties)" confirmLabel="Release funds" />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
