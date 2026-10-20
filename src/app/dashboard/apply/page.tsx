import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { RANKS, REGIONS } from "@/lib/valorant";
import { isBookable } from "@/lib/catalog";
import { applyProviderAction } from "@/actions/account";
import { ActionForm, CheckboxGroup, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Notice, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Provider application" };

export default async function ApplyPage() {
  const viewer = await requireViewer();
  if (viewer.role !== "PROVIDER")
    return <Card><EmptyState title="Provider applications" body="Provider applications are submitted from a provider account. Register a separate provider account to apply." action={<LinkButton href="/register?type=provider" variant="secondary">Register as provider</LinkButton>} /></Card>;
  const [apps, services] = await Promise.all([
    db.providerApplication.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" } }),
    db.service.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const open = apps.find((a) => a.status === "SUBMITTED");
  const canApply = !open && viewer.providerStatus !== "APPROVED" && viewer.providerStatus !== "SUSPENDED";

  return (
    <>
      <PageHeader title="Provider application" subtitle="Every Redline provider is personally vetted before they can bid on paid orders." />
      {viewer.providerStatus === "APPROVED" && <div className="mb-6"><Notice tone="ok">You&apos;re an approved provider. <Link className="underline" href="/dashboard/profile">Complete your public profile</Link>.</Notice></div>}
      {open && <div className="mb-6"><Notice tone="info">Your application submitted {fmtDate(open.createdAt)} is under review. We verify your rank and history before approval.</Notice></div>}

      {canApply && (
        <Card className="mb-6 max-w-3xl">
          <CardHeader title="Apply" subtitle="We review rank history, conduct and experience. Approval is not guaranteed." />
          <ActionForm action={applyProviderAction} className="space-y-5 px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="riotId">Riot ID</label><input id="riotId" name="riotId" required placeholder="Name#TAG" className="input" /></div>
              <div><label className="label" htmlFor="currentRank">Current rank</label><select id="currentRank" name="currentRank" className="input" defaultValue="Immortal 1">{RANKS.map((r) => <option key={r}>{r}</option>)}</select></div>
              <div><label className="label" htmlFor="peakRank">Peak rank</label><select id="peakRank" name="peakRank" className="input" defaultValue="Immortal 1">{RANKS.map((r) => <option key={r}>{r}</option>)}</select></div>
            </div>
            <div><p className="label">Regions</p><CheckboxGroup name="regions" columns={3} options={REGIONS.map((r) => ({ value: r.code, label: r.name }))} /></div>
            <div>
              <p className="label">Services you want to offer</p>
              <CheckboxGroup name="services" columns={3} options={services.map((s) => ({ value: s.slug, label: `${s.name}${isBookable(s) ? "" : " (not yet live)"}` }))} />
            </div>
            <div><label className="label" htmlFor="experience">Experience & qualifications</label><textarea id="experience" name="experience" rows={5} required minLength={50} className="input" placeholder="Competitive history, coaching experience, teams, tournaments…" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="trackerUrl">Tracker profile URL (optional)</label><input id="trackerUrl" name="trackerUrl" type="url" className="input" /></div>
              <div><label className="label" htmlFor="discordHandle">Discord (optional)</label><input id="discordHandle" name="discordHandle" className="input" /></div>
            </div>
            <label className="flex items-start gap-2 text-sm text-muted">
              <input type="checkbox" name="agreedToRules" className="mt-1 accent-[#E50914]" required />
              I agree to the provider rules: I will never request or accept account passwords, will respect minimum prices, and will communicate through Redline order messaging.
            </label>
            <SubmitButton>Submit application</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {apps.length > 0 && (
        <Card className="max-w-3xl">
          <CardHeader title="Application history" />
          <ul className="divide-y divide-line">
            {apps.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Submitted {fmtDate(a.createdAt)}</span>
                  <Badge tone={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "amber"}>{a.status.toLowerCase()}</Badge>
                </div>
                {a.reviewNote && <p className="mt-1 text-muted">Reviewer note: {a.reviewNote}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
