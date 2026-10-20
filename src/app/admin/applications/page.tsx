import { db } from "@/lib/db";
import { reviewApplicationAction } from "@/actions/admin";
import { ConfirmAction } from "@/components/forms";
import { Avatar, Badge, Card, CardHeader, DL, EmptyState, PageHeader, RankChip, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Provider approvals" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "SUBMITTED" } = await searchParams;
  const s = ["SUBMITTED", "APPROVED", "REJECTED"].includes(status) ? (status as "SUBMITTED") : "SUBMITTED";
  const [apps, counts] = await Promise.all([
    db.providerApplication.findMany({ where: { status: s }, orderBy: { createdAt: s === "SUBMITTED" ? "asc" : "desc" }, take: 50, include: { user: { select: { displayName: true, email: true, avatarColor: true, createdAt: true } } } }),
    db.providerApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (k: string) => counts.find((x) => x.status === k)?._count ?? 0;
  return (
    <>
      <PageHeader title="Provider approvals" subtitle="Vet each applicant before they can bid on paid orders." />
      <Tabs active={s} tabs={[{ key: "SUBMITTED", label: "Queue", href: "?status=SUBMITTED", count: c("SUBMITTED") }, { key: "APPROVED", label: "Approved", href: "?status=APPROVED" }, { key: "REJECTED", label: "Rejected", href: "?status=REJECTED" }]} />
      {apps.length === 0 ? (
        <Card><EmptyState title={s === "SUBMITTED" ? "Queue is empty" : "Nothing here"} /></Card>
      ) : (
        <div className="space-y-4">
          {apps.map((a) => (
            <Card key={a.id}>
              <CardHeader
                title={<span className="flex items-center gap-2.5"><Avatar name={a.user.displayName} color={a.user.avatarColor} size={28} />{a.user.displayName}<span className="text-xs font-normal text-faint">{a.user.email}</span></span>}
                subtitle={`Submitted ${fmtDate(a.createdAt)} · account created ${fmtDate(a.user.createdAt)}`}
                action={a.status !== "SUBMITTED" ? <Badge tone={a.status === "APPROVED" ? "green" : "red"}>{a.status.toLowerCase()}</Badge> : undefined}
              />
              <div className="grid gap-6 px-5 py-4 lg:grid-cols-[1fr_1fr]">
                <DL items={[
                  ["Riot ID", <span key="r" className="font-mono">{a.riotId}</span>],
                  ["Current / peak rank", <span key="k" className="flex gap-3"><RankChip rank={a.currentRank} /><RankChip rank={a.peakRank} /></span>],
                  ["Regions", a.regions.join(", ")],
                  ["Services", a.services.join(", ")],
                  ["Tracker", a.trackerUrl ? <a key="t" href={a.trackerUrl} target="_blank" rel="noreferrer noopener" className="text-red-hot underline">{a.trackerUrl}</a> : "—"],
                  ["Discord", a.discordHandle ?? "—"],
                ]} />
                <div>
                  <p className="label">Experience</p>
                  <p className="text-sm whitespace-pre-line text-muted">{a.experience}</p>
                  {a.reviewNote && <p className="mt-3 text-sm text-faint">Review note: {a.reviewNote}</p>}
                </div>
              </div>
              {a.status === "SUBMITTED" && (
                <div className="flex gap-2 border-t border-line px-5 py-3">
                  <ConfirmAction action={reviewApplicationAction} hidden={{ applicationId: a.id, decision: "APPROVED" }} variant="primary" label="Approve" title={`Approve ${a.user.displayName}?`} body={<p>They will be able to bid on paid orders immediately. Confirm you have checked their rank history and conduct.</p>} reason reasonLabel="Internal note (optional)" confirmLabel="Approve provider">
                    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="rankVerified" className="accent-[#E50914]" /> I verified their current rank</label>
                  </ConfirmAction>
                  <ConfirmAction action={reviewApplicationAction} hidden={{ applicationId: a.id, decision: "REJECTED" }} label="Reject" title="Reject application?" reason reasonLabel="Feedback shown to applicant" confirmLabel="Reject" />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
