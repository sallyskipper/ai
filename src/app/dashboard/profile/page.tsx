import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, COACHING_TYPES, RANKS, REGIONS } from "@/lib/valorant";
import { updateProviderProfileAction } from "@/actions/account";
import { ActionForm, CheckboxGroup, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const profile = viewer.role === "PROVIDER" ? await db.providerProfile.findUnique({ where: { userId: viewer.id } }) : null;
  if (!profile) return <Card><EmptyState title="No provider profile" body="Apply to become a provider first." action={<LinkButton href="/dashboard/apply">Apply</LinkButton>} /></Card>;
  const services = await db.service.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader
        title="My profile"
        subtitle="This is what customers see when comparing offers."
        actions={profile.status === "APPROVED" ? <LinkButton href={`/providers/${viewer.id}`} variant="secondary">View public profile</LinkButton> : <Badge tone="amber">{profile.status.toLowerCase()}</Badge>}
      />
      <Card className="max-w-4xl">
        <CardHeader title="Public profile" />
        <ActionForm action={updateProviderProfileAction} className="space-y-5 px-5 py-5">
          <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={4} maxLength={1500} defaultValue={profile.bio} className="input" /></div>
          <div><label className="label" htmlFor="qualifications">Qualifications & experience</label><textarea id="qualifications" name="qualifications" rows={3} maxLength={1500} defaultValue={profile.qualifications} className="input" /></div>
          <div><label className="label" htmlFor="coachingStyle">Coaching style</label><textarea id="coachingStyle" name="coachingStyle" rows={3} maxLength={1000} defaultValue={profile.coachingStyle} className="input" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="currentRank">Current rank</label>
              <select id="currentRank" name="currentRank" defaultValue={profile.currentRank ?? "Immortal 1"} className="input">{RANKS.map((r) => <option key={r}>{r}</option>)}</select>
              <p className="mt-1 text-xs text-faint">{profile.rankVerified ? "Verified by Redline. Changing it removes verification." : "Self-reported until verified by Redline."}</p>
            </div>
            <div><label className="label" htmlFor="availability">Availability</label><input id="availability" name="availability" maxLength={500} defaultValue={profile.availability} className="input" placeholder="Weeknights 6–11pm CET" /></div>
            <div><label className="label" htmlFor="languages">Languages (comma separated)</label><input id="languages" name="languages" defaultValue={profile.languages.join(", ")} className="input" /></div>
          </div>
          <div><p className="label">Services</p><CheckboxGroup name="supportedServices" columns={3} defaultValue={profile.supportedServices} options={services.map((s) => ({ value: s.slug, label: s.name }))} /></div>
          <div><p className="label">Regions</p><CheckboxGroup name="regions" columns={3} defaultValue={profile.regions} options={REGIONS.map((r) => ({ value: r.code, label: r.name }))} /></div>
          <div><p className="label">Coaching specialties</p><CheckboxGroup name="coachingSpecialties" columns={2} defaultValue={profile.coachingSpecialties} options={COACHING_TYPES.map((c) => ({ value: c.code, label: c.name }))} /></div>
          <div><p className="label">Main agents (up to 8)</p><CheckboxGroup name="agents" columns={4} defaultValue={profile.agents} options={AGENTS.map((a) => ({ value: a, label: a }))} /></div>
          <SubmitButton>Save profile</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
