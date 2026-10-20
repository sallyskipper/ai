import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { ACTIVE_STATUSES, OPEN_STATUSES, STATUS_LABELS } from "@/lib/domain/order-machine";
import { adminCancelOrderAction } from "@/actions/admin";
import { ConfirmAction } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, Pagination, ServiceBadge, StatusBadge, btnClass, fmtDate } from "@/components/ui";

export const metadata = { title: "Orders & offers" };
const PER_PAGE = 25;

const GROUPS: Record<string, OrderStatus[]> = { open: OPEN_STATUSES, active: ACTIVE_STATUSES };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const statuses = sp.status ? (GROUPS[sp.status] ?? (sp.status in STATUS_LABELS ? [sp.status as OrderStatus] : undefined)) : undefined;
  const num = Number(sp.q);
  const where: Prisma.OrderWhereInput = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(sp.service ? { service: { kind: sp.service as "COACHING" } } : {}),
    ...(sp.q
      ? { OR: [...(Number.isInteger(num) ? [{ number: num }] : []), { title: { contains: sp.q, mode: "insensitive" as const } }, { customer: { email: { contains: sp.q, mode: "insensitive" as const } } }, { provider: { email: { contains: sp.q, mode: "insensitive" as const } } }] }
      : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        service: true,
        customer: { select: { displayName: true, email: true } },
        provider: { select: { displayName: true } },
        offers: { orderBy: { priceCents: "asc" }, include: { provider: { select: { displayName: true } } } },
      },
    }),
    db.order.count({ where }),
  ]);
  const qs = (p: number) => `/admin/orders?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Orders & offers" subtitle={`${total} orders`} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-60 flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} placeholder="Order #, title, customer or provider email" className="input" /></div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
              <option value="">All</option><option value="open">Open (any)</option><option value="active">Active (any)</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="service">Service</label>
            <select id="service" name="service" defaultValue={sp.service ?? ""} className="input"><option value="">All</option><option value="SOLO_RANK_UP">Solo</option><option value="DUO_RANK_UP">Duo</option><option value="COACHING">Coaching</option></select>
          </div>
          <button className={btnClass("secondary")}>Filter</button>
        </form>
      </Card>
      <Card>
        {orders.length === 0 ? <EmptyState title="No orders" /> : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-3 hover:bg-panel-2/50">
                    <span className="font-mono text-xs text-faint">#{o.number}</span>
                    <ServiceBadge kind={o.service.kind} />
                    <span className="min-w-40 flex-1 font-medium">{o.title}</span>
                    <StatusBadge status={o.status} />
                    <span className="w-28 text-right text-sm tabular-nums">{o.agreedPriceCents ? formatCents(o.agreedPriceCents) : <span className="text-muted">min {formatCents(o.minPriceCents)}</span>}</span>
                    <span className="w-32 text-right text-xs text-muted">{fmtDate(o.updatedAt)}</span>
                    <span className="text-faint transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="grid gap-4 border-t border-line bg-coal px-5 py-4 text-sm lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-1.5">
                      <p><span className="text-faint">Customer:</span> {o.customer.displayName} <span className="text-faint">({o.customer.email})</span></p>
                      <p><span className="text-faint">Provider:</span> {o.provider?.displayName ?? "—"}</p>
                      <p><span className="text-faint">Region:</span> {o.region} · <span className="text-faint">Budget:</span> {formatCents(o.budgetCents)}</p>
                      <p><span className="text-faint">Commission snapshot:</span> {o.commissionBps != null ? `${o.commissionBps / 100}% → fee ${formatCents(o.platformFeeCents)}, net ${formatCents(o.providerNetCents)}` : "—"}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Link href={`/dashboard/orders/${o.id}`} className={btnClass("secondary", "sm")}>Open workspace</Link>
                        <Link href={`/admin/audit?entity=${o.id}`} className={btnClass("ghost", "sm")}>Audit trail</Link>
                        {(["DRAFT", "OPEN_FOR_OFFERS", "OFFERS_RECEIVED", "AWAITING_PAYMENT", "CANCELLATION_REQUESTED"] as OrderStatus[]).includes(o.status) && (
                          <ConfirmAction action={adminCancelOrderAction} hidden={{ orderId: o.id }} size="sm" label={o.status === "CANCELLATION_REQUESTED" ? "Approve cancellation & refund" : "Cancel order"} title="Cancel this order as admin?" body={<p>{o.status === "CANCELLATION_REQUESTED" ? "The customer is refunded in full and the provider's earning is reversed." : "No payment has been taken; all offers are closed."}</p>} reason reasonRequired confirmLabel="Cancel order" />
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="label">Offers ({o.offers.length})</p>
                      {o.offers.length === 0 ? <p className="text-muted">No offers.</p> : (
                        <table className="w-full text-xs">
                          <tbody>
                            {o.offers.map((of) => (
                              <tr key={of.id} className="border-b border-line/60 last:border-0">
                                <td className="py-1.5">{of.provider.displayName}</td>
                                <td className="py-1.5"><Badge tone={of.status === "ACCEPTED" ? "green" : of.status === "ACTIVE" ? "blue" : "gray"}>{of.status.toLowerCase()}</Badge></td>
                                <td className="py-1.5 text-right tabular-nums">{formatCents(of.priceCents)}</td>
                                <td className="py-1.5 text-right text-faint">min {formatCents(of.minPriceCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={qs} />
      </Card>
    </>
  );
}
