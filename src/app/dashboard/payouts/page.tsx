import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getIntSetting } from "@/lib/settings";
import { gatewayName } from "@/lib/payments/gateway";
import { providerBalances } from "@/lib/payments/service";
import { connectPayoutAccountAction, requestPayoutAction } from "@/actions/account";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, StatCard, fmtDate } from "@/components/ui";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const viewer = await requireViewer();
  const [b, payouts, profile, minPayout] = await Promise.all([
    providerBalances(viewer.id),
    db.payout.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" } }),
    db.providerProfile.findUnique({ where: { userId: viewer.id } }),
    getIntSetting(db, "minPayoutCents"),
  ]);
  let gateway: string;
  try { gateway = gatewayName(); } catch { gateway = "unavailable"; }
  const stripeReady = gateway === "stripe" && !!profile?.stripeAccountId && profile.payoutsEnabled;
  const canWithdraw = b.available >= minPayout && (gateway === "sandbox" || stripeReady) && profile?.status === "APPROVED";

  return (
    <>
      <PageHeader title="Payouts" subtitle="Withdraw available earnings to your connected payout account." />
      {gateway === "sandbox" && <div className="mb-4"><Notice tone="warn">Sandbox mode: payouts are simulated and no real money is sent. Configure Stripe to enable real payouts.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Available to withdraw" value={formatCents(b.available)} accent />
            <StatCard label="Paid out to date" value={formatCents(b.paid)} />
          </div>
          <Card>
            <CardHeader title="Payout history" />
            {payouts.length === 0 ? (
              <EmptyState title="No payouts yet" />
            ) : (
              <table className="table-base">
                <thead><tr><th>Date</th><th>Reference</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="text-muted">{fmtDate(p.createdAt)}</td>
                      <td className="font-mono text-xs text-muted">{p.externalId ?? p.id}</td>
                      <td>
                        <Badge tone={p.status === "PAID" ? "green" : p.status === "FAILED" ? "red" : "amber"}>{p.status.toLowerCase()}</Badge>
                        {p.provider === "sandbox" && <Badge tone="amber" className="ml-1">sandbox</Badge>}
                        {p.failureReason && <p className="mt-1 text-xs text-faint">{p.failureReason.slice(0, 120)}</p>}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{formatCents(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Withdraw" />
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-muted">Minimum payout: {formatCents(minPayout)}. Disputed funds are held until resolved.</p>
              {canWithdraw ? (
                <ConfirmAction action={requestPayoutAction} variant="primary" label={`Withdraw ${formatCents(b.available)}`} title="Request payout?" body={<p>{formatCents(b.available)} will be transferred to your payout account.</p>} confirmLabel="Withdraw" />
              ) : (
                <button disabled className="h-10 w-full rounded-md border border-line text-faint">Nothing to withdraw yet</button>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Payout account" />
            <div className="space-y-3 px-5 py-4 text-sm">
              {gateway === "stripe" ? (
                <>
                  <p className="text-muted">Payouts are sent via Stripe Connect. Identity verification is handled by Stripe.</p>
                  <p>Status: {stripeReady ? <Badge tone="green">Payouts enabled</Badge> : profile?.stripeAccountId ? <Badge tone="amber">Verification incomplete</Badge> : <Badge>Not connected</Badge>}</p>
                  <ActionForm action={connectPayoutAccountAction}><SubmitButton variant="secondary">{profile?.stripeAccountId ? "Update payout details" : "Connect payout account"}</SubmitButton></ActionForm>
                </>
              ) : (
                <p className="text-muted">Payout accounts are connected through Stripe once real payments are enabled.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
