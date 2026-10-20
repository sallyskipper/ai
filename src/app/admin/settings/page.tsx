import { db } from "@/lib/db";
import { getIntSetting } from "@/lib/settings";
import { updateSettingsAction } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Commission & fees" };

export default async function SettingsAdmin() {
  const [bps, hold, minPayout] = await Promise.all([getIntSetting(db, "commissionBps"), getIntSetting(db, "payoutHoldHours"), getIntSetting(db, "minPayoutCents")]);
  return (
    <>
      <PageHeader title="Commission & fees" subtitle="Platform-wide money settings." />
      <div className="mb-6 max-w-2xl"><Notice tone="info">Commission is snapshotted onto each order when an offer is accepted. Changing it never alters existing commitments.</Notice></div>
      <Card className="max-w-2xl">
        <CardHeader title="Settings" />
        <ActionForm action={updateSettingsAction} className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label" htmlFor="commissionPct">Commission (%)</label><input id="commissionPct" name="commissionPct" defaultValue={bps / 100} inputMode="decimal" className="input" /></div>
            <div><label className="label" htmlFor="payoutHoldHours">Payout hold (hours)</label><input id="payoutHoldHours" name="payoutHoldHours" type="number" min={0} max={720} defaultValue={hold} className="input" /></div>
            <div><label className="label" htmlFor="minPayout">Minimum payout ($)</label><input id="minPayout" name="minPayout" defaultValue={(minPayout / 100).toFixed(2)} inputMode="decimal" className="input" /></div>
          </div>
          <p className="text-xs text-faint">Payout hold is extra time after customer confirmation before earnings become withdrawable (0 = immediately, subject to the payment provider&apos;s own settlement timing).</p>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
