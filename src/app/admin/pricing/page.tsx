import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { COACHING_TYPES, TIERS } from "@/lib/valorant";
import { savePricingRuleAction, togglePricingRuleAction } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Notice, PageHeader, ServiceBadge, fmtDate } from "@/components/ui";

export const metadata = { title: "Minimum prices" };

const UNIT_LABEL = { DIVISION: "per division", GAME: "per game", HOUR: "per hour" } as const;
const UNITS_FOR = { SOLO_RANK_UP: ["DIVISION"], DUO_RANK_UP: ["DIVISION", "GAME"], COACHING: ["HOUR"] } as const;

export default async function PricingPage() {
  const services = await db.service.findMany({
    orderBy: { sortOrder: "asc" },
    include: { pricingRules: { orderBy: [{ unit: "asc" }, { amountCents: "asc" }] } },
  });
  return (
    <>
      <PageHeader title="Minimum prices" subtitle="Configure minimum accepted prices separately for Solo Rank Up, Duo Rank Up and Coaching." />
      <div className="mb-6">
        <Notice tone="info">
          An order&apos;s minimum = sum of matching rules (by rank tier, unit and coaching type), never below the service floor. The minimum is snapshotted on each order at creation, so changes here only apply to new orders. Every change is written to the audit log.
        </Notice>
      </div>
      <div className="space-y-6">
        {services.map((s) => (
          <Card key={s.id}>
            <CardHeader title={<span className="flex items-center gap-2"><ServiceBadge kind={s.kind} />{s.name}</span>} subtitle={`Service floor ${formatCents(s.floorPriceCents)} — edit on the Service catalog page`} />
            <div className="overflow-x-auto">
              <table className="table-base min-w-[720px]">
                <thead><tr><th>Unit</th><th>Rank tier</th><th>Variant</th><th>Amount</th><th>Status</th><th>Updated</th><th></th></tr></thead>
                <tbody>
                  {s.pricingRules.map((r) => (
                    <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                      <td>{UNIT_LABEL[r.unit]}</td>
                      <td>{r.tier ?? <span className="text-faint">Any</span>}</td>
                      <td>{r.variant ? COACHING_TYPES.find((c) => c.code === r.variant)?.name : <span className="text-faint">Any</span>}</td>
                      <td>
                        <ActionForm action={savePricingRuleAction} className="flex items-center gap-2">
                          <input type="hidden" name="ruleId" value={r.id} />
                          <span className="text-faint">$</span>
                          <input name="amount" defaultValue={(r.amountCents / 100).toFixed(2)} inputMode="decimal" className="input h-8 w-24 py-1" aria-label="Amount" />
                          <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                        </ActionForm>
                      </td>
                      <td>{r.active ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge>}</td>
                      <td className="text-xs text-muted">{fmtDate(r.updatedAt)}</td>
                      <td className="text-right">
                        <ActionForm action={togglePricingRuleAction}><input type="hidden" name="ruleId" value={r.id} /><SubmitButton size="sm" variant="ghost">{r.active ? "Deactivate" : "Activate"}</SubmitButton></ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ActionForm action={savePricingRuleAction} resetOnSuccess className="flex flex-wrap items-end gap-3 border-t border-line bg-coal px-5 py-4">
              <input type="hidden" name="serviceId" value={s.id} />
              <div>
                <label className="label">Unit</label>
                <select name="unit" className="input">{UNITS_FOR[s.kind].map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select>
              </div>
              <div>
                <label className="label">Tier</label>
                <select name="tier" className="input"><option value="">Any</option>{TIERS.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              {s.kind === "COACHING" && (
                <div>
                  <label className="label">Coaching type</label>
                  <select name="variant" className="input"><option value="">Any</option>{COACHING_TYPES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
                </div>
              )}
              <div><label className="label">Amount ($)</label><input name="amount" required inputMode="decimal" className="input w-28" /></div>
              <SubmitButton>Add rule</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
