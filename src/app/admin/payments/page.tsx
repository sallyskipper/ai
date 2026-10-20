import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { gatewayName } from "@/lib/payments/gateway";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, StatCard, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Payments & payouts" };

export default async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "payments" } = await searchParams;
  let gateway = "unavailable";
  try { gateway = gatewayName(); } catch {}
  const [payments, refunds, payouts, held, available, pendingFees, problemRefunds] = await Promise.all([
    tab === "payments" ? db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, number: true, customer: { select: { email: true } } } } } }) : [],
    tab === "refunds" ? db.refund.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { payment: { include: { order: { select: { id: true, number: true } } } } } }) : [],
    tab === "payouts" ? db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { displayName: true, email: true } } } }) : [],
    db.ledgerEntry.aggregate({ where: { type: "PROVIDER_EARNING", status: "HELD" }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { type: "PROVIDER_EARNING", status: "AVAILABLE" }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { type: "PROVIDER_EARNING", status: "PENDING" }, _sum: { amountCents: true } }),
    db.refund.count({ where: { status: { in: ["failed", "pending"] } } }),
  ]);
  return (
    <>
      <PageHeader title="Payments & payouts" subtitle={`Gateway: ${gateway}. Payments are confirmed only by verified webhooks.`} />
      {gateway === "sandbox" && <div className="mb-4"><Notice tone="warn">Sandbox mode — no real money moves. Set PAYMENTS_PROVIDER=stripe with Stripe keys to go live.</Notice></div>}
      {problemRefunds > 0 && <div className="mb-4"><Notice tone="danger">{problemRefunds} refund(s) failed or are stuck pending. Reconcile them in the payment provider dashboard.</Notice></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Provider earnings pending" value={formatCents(pendingFees._sum.amountCents ?? 0)} hint="Awaiting customer confirmation" />
        <StatCard label="Held in disputes" value={formatCents(held._sum.amountCents ?? 0)} accent />
        <StatCard label="Available to providers" value={formatCents(available._sum.amountCents ?? 0)} />
      </div>
      <Tabs active={tab} tabs={[{ key: "payments", label: "Payments", href: "?tab=payments" }, { key: "refunds", label: "Refunds", href: "?tab=refunds", count: problemRefunds }, { key: "payouts", label: "Payouts", href: "?tab=payouts" }]} />
      <Card>
        {tab === "payments" && (payments.length === 0 ? <EmptyState title="No payments" /> : (
          <div className="overflow-x-auto"><table className="table-base min-w-[800px]">
            <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Gateway ref</th><th>Status</th><th className="text-right">Amount</th><th className="text-right">Refunded</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}>
                <td className="text-muted">{fmtDate(p.createdAt)}</td>
                <td><Link href={`/dashboard/orders/${p.order.id}`} className="font-mono text-xs hover:text-red-hot">#{p.order.number}</Link></td>
                <td className="text-xs">{p.order.customer.email}</td>
                <td className="font-mono text-xs text-faint">{p.provider}:{(p.paymentIntentId ?? p.externalId ?? "—").slice(0, 24)}</td>
                <td><Badge tone={p.status === "SUCCEEDED" ? "green" : p.status === "PENDING" ? "amber" : p.status === "FAILED" ? "gray" : "blue"}>{p.status.toLowerCase()}</Badge></td>
                <td className="text-right tabular-nums">{formatCents(p.amountCents)}</td>
                <td className="text-right text-muted tabular-nums">{p.refundedCents ? formatCents(p.refundedCents) : "—"}</td>
              </tr>))}</tbody>
          </table></div>
        ))}
        {tab === "refunds" && (refunds.length === 0 ? <EmptyState title="No refunds" /> : (
          <table className="table-base">
            <thead><tr><th>Date</th><th>Order</th><th>Reason</th><th>Reference</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{refunds.map((r) => (
              <tr key={r.id}>
                <td className="text-muted">{fmtDate(r.createdAt)}</td>
                <td><Link href={`/dashboard/orders/${r.payment.order.id}`} className="font-mono text-xs hover:text-red-hot">#{r.payment.order.number}</Link></td>
                <td className="text-sm">{r.reason}</td>
                <td className="font-mono text-xs text-faint">{r.externalId ?? "—"}</td>
                <td><Badge tone={r.status === "succeeded" ? "green" : "red"}>{r.status}</Badge></td>
                <td className="text-right tabular-nums">{formatCents(r.amountCents)}</td>
              </tr>))}</tbody>
          </table>
        ))}
        {tab === "payouts" && (payouts.length === 0 ? <EmptyState title="No payouts" /> : (
          <table className="table-base">
            <thead><tr><th>Date</th><th>Provider</th><th>Reference</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{payouts.map((p) => (
              <tr key={p.id}>
                <td className="text-muted">{fmtDate(p.createdAt)}</td>
                <td>{p.user.displayName} <span className="text-xs text-faint">{p.user.email}</span></td>
                <td className="font-mono text-xs text-faint">{p.externalId ?? "—"}</td>
                <td><Badge tone={p.status === "PAID" ? "green" : p.status === "FAILED" ? "red" : "amber"}>{p.status.toLowerCase()}</Badge>{p.provider === "sandbox" && <Badge tone="amber" className="ml-1">sandbox</Badge>}</td>
                <td className="text-right tabular-nums">{formatCents(p.amountCents)}</td>
              </tr>))}</tbody>
          </table>
        ))}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Reconciliation" />
        <p className="px-5 py-4 text-sm text-muted">Every payment, refund and payout row stores the gateway reference. Webhook events are stored by event id (deduplicated) so deliveries can be replayed safely. Compare these references against the payment provider dashboard during reconciliation.</p>
      </Card>
    </>
  );
}
