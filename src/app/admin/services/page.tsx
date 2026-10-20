import { db } from "@/lib/db";
import { isBookable } from "@/lib/catalog";
import { recordComplianceReviewAction, revokeComplianceAction, updateServiceAction } from "@/actions/admin";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Notice, PageHeader, ServiceBadge, fmtDate } from "@/components/ui";

export const metadata = { title: "Service catalog" };

export default async function ServicesAdmin() {
  const games = await db.game.findMany({ include: { services: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { orders: true } } } } } });
  return (
    <>
      <PageHeader title="Service catalog" subtitle="Enable services, set floor prices and record compliance reviews. New games and categories are added as catalog rows." />
      {games.map((g) => (
        <div key={g.id} className="space-y-6">
          <h2 className="font-display text-lg font-semibold">{g.name}</h2>
          {g.services.map((s) => (
            <Card key={s.id}>
              <CardHeader
                title={<span className="flex items-center gap-2"><ServiceBadge kind={s.kind} />{s.name}{s.accountOperated && <Badge tone="amber">Account-operated</Badge>}</span>}
                subtitle={`${s._count.orders} orders · slug ${s.slug}`}
                action={isBookable(s) ? <Badge tone="green">live</Badge> : <Badge>disabled</Badge>}
              />
              {s.accountOperated && (
                <div className="border-b border-line px-5 py-4">
                  {s.complianceReviewedAt ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Notice tone="ok">Compliance review recorded {fmtDate(s.complianceReviewedAt)}: {s.complianceNote}</Notice>
                      <ConfirmAction action={revokeComplianceAction} hidden={{ serviceId: s.id }} size="sm" label="Revoke approval" title="Revoke compliance approval?" body={<p>The service is disabled immediately for new orders.</p>} confirmLabel="Revoke" />
                    </div>
                  ) : (
                    <>
                      <Notice tone="warn">This service must stay disabled until you have verified the game publisher&apos;s current rules and your payment provider&apos;s requirements permit it. Redline never collects game passwords — any launch must use a workflow that doesn&apos;t require credential sharing.</Notice>
                      <ActionForm action={recordComplianceReviewAction} className="mt-4 space-y-3">
                        <input type="hidden" name="serviceId" value={s.id} />
                        <div><label className="label">Review notes (sources, dates, reviewer)</label><textarea name="note" rows={3} minLength={20} required className="input" /></div>
                        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="confirm" required className="accent-[#E50914]" /> I confirm both the publisher-rules review and the payment-provider review were completed and permit this service.</label>
                        <SubmitButton variant="secondary">Record compliance review</SubmitButton>
                      </ActionForm>
                    </>
                  )}
                </div>
              )}
              <ActionForm action={updateServiceAction} className="grid gap-4 px-5 py-4 md:grid-cols-[160px_1fr]">
                <input type="hidden" name="serviceId" value={s.id} />
                <div>
                  <label className="label">Floor price ($)</label>
                  <input name="floor" defaultValue={(s.floorPriceCents / 100).toFixed(2)} inputMode="decimal" className="input" />
                  <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="accent-[#E50914]" /> Enabled</label>
                </div>
                <div className="space-y-3">
                  <div><label className="label">Tagline</label><input name="tagline" defaultValue={s.tagline} className="input" /></div>
                  <div><label className="label">Service rules</label><textarea name="rules" rows={3} defaultValue={s.rules} className="input" /></div>
                </div>
                <div className="md:col-span-2"><SubmitButton>Save service</SubmitButton></div>
              </ActionForm>
            </Card>
          ))}
        </div>
      ))}
    </>
  );
}
