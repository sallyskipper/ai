import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, Pagination, btnClass, fmtDate } from "@/components/ui";

export const metadata = { title: "Audit log" };
const PER_PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.entity ? { entityId: sp.entity } : {}),
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
  };
  // Order-level state changes are recorded as order events; show them too when filtering by an order.
  const [logs, total, events] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: { actor: { select: { displayName: true, email: true } } } }),
    db.auditLog.count({ where }),
    sp.entity ? db.orderEvent.findMany({ where: { orderId: sp.entity }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Administrative and money-movement actions." />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div><label className="label" htmlFor="action">Action prefix</label><input id="action" name="action" defaultValue={sp.action} placeholder="e.g. pricing, dispute, payout" className="input" /></div>
          <div className="min-w-64 flex-1"><label className="label" htmlFor="entity">Entity id</label><input id="entity" name="entity" defaultValue={sp.entity} className="input" /></div>
          <button className={btnClass("secondary")}>Filter</button>
        </form>
      </Card>
      {events.length > 0 && (
        <Card className="mb-4">
          <p className="border-b border-line px-5 py-3 text-sm font-semibold">Order state transitions</p>
          <table className="table-base"><tbody>{events.map((e) => (
            <tr key={e.id}><td className="w-48 text-xs text-muted">{fmtDate(e.createdAt)}</td><td className="font-mono text-xs text-red-hot">{e.type}</td><td className="text-sm">{e.fromStatus ?? "—"} → {e.toStatus ?? "—"}</td><td className="text-sm text-muted">{e.message}</td></tr>
          ))}</tbody></table>
        </Card>
      )}
      <Card>
        {logs.length === 0 ? <EmptyState title="No entries" /> : (
          <div className="overflow-x-auto"><table className="table-base min-w-[900px]">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Data</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id}>
                <td className="text-xs text-muted">{fmtDate(l.createdAt)}</td>
                <td className="text-sm">{l.actor ? <>{l.actor.displayName}<span className="block text-xs text-faint">{l.actor.email}</span></> : <span className="text-faint">System</span>}</td>
                <td className="font-mono text-xs text-red-hot">{l.action}</td>
                <td className="font-mono text-xs">{l.entityType}<span className="block text-faint">{l.entityId}</span></td>
                <td className="max-w-md truncate font-mono text-xs text-muted" title={JSON.stringify(l.data)}>{l.data ? JSON.stringify(l.data) : "—"}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `?${new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), ...(sp.action ? { action: sp.action } : {}), page: String(p) })}`} />
      </Card>
    </>
  );
}
