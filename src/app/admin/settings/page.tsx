import { db } from "@/lib/db";
import { getCommissionTiers, getIntSetting } from "@/lib/settings";
import { updateSettingsAction } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Commission & fees" };

export default async function SettingsAdmin() {
  const [tiers, hold, minPayout] = await Promise.all([getCommissionTiers(db), getIntSetting(db, "payoutHoldHours"), getIntSetting(db, "minPayoutCents")]);
  return (
    <>
      <PageHeader title="Commission & fees" subtitle="Platform-wide money settings." />
      <div className="mb-6 max-w-2xl"><Notice tone="info">Commission is snapshotted onto each order when an offer is accepted. Changing it never alters existing commitments.</Notice></div>
      <Card className="max-w-2xl">
        <CardHeader title="Settings" />
        <ActionForm action={updateSettingsAction} className="space-y-4 px-5 py-4">
          <div>
            <p className="label">Commission by order size (5–10%)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {tiers.map((t) => (
                <div key={t.key}>
                  <label className="text-xs text-muted" htmlFor={t.key}>{t.label} (%)</label>
                  <input id={t.key} name={t.key} type="number" min={5} max={10} step={0.5} defaultValue={t.bps / 100} className="input mt-1" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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
