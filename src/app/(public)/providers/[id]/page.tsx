import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { providerStats } from "@/lib/domain/reviews";
import { coachingName } from "@/lib/valorant";
import { toggleFavoriteAction } from "@/actions/account";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, CardHeader, DL, EmptyState, LinkButton, Pagination, RankChip, Stars, VerifiedBadge, fmtDate, pct } from "@/components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

export default async function ProviderProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const user = await db.user.findUnique({ where: { id }, include: { providerProfile: true } });
  const profile = user?.providerProfile;
  if (!user || !profile || profile.status !== "APPROVED" || user.status !== "ACTIVE") notFound();

  const viewer = await getViewer();
  const [stats, services, reviewTotal, reviews, favorite, distribution] = await Promise.all([
    providerStats(id),
    db.service.findMany({ where: { slug: { in: profile.supportedServices } }, select: { slug: true, name: true, kind: true } }),
    db.review.count({ where: { providerId: id, status: "PUBLISHED" } }),
    db.review.findMany({
      where: { providerId: id, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { author: { select: { displayName: true, avatarColor: true } }, order: { select: { service: { select: { name: true } } } } },
    }),
    viewer ? db.favorite.findUnique({ where: { userId_providerId: { userId: viewer.id, providerId: id } } }) : null,
    db.review.groupBy({ by: ["rating"], where: { providerId: id, status: "PUBLISHED" }, _count: true }),
  ]);
  const dist = Object.fromEntries(distribution.map((d) => [d.rating, d._count]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="card relative overflow-hidden">
        <div className="stripe-bg h-28 border-b border-line bg-coal" />
        <div className="flex flex-col gap-6 px-6 pb-6 md:flex-row md:items-end">
          <div className="-mt-10"><Avatar name={user.displayName} color={user.avatarColor} size={88} /></div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold">{user.displayName}</h1>
              <VerifiedBadge />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <Stars value={stats.avgRating} />
              <span>{stats.reviewCount ? `${stats.avgRating!.toFixed(2)} from ${stats.reviewCount} verified review${stats.reviewCount === 1 ? "" : "s"}` : "No reviews yet"}</span>
              <span className="text-faint">·</span>
              <span>Member since {user.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {viewer && viewer.role === "CUSTOMER" && (
              <ActionForm action={toggleFavoriteAction}>
                <input type="hidden" name="providerId" value={id} />
                <SubmitButton variant="secondary">{favorite ? "★ Favorited" : "☆ Add to favorites"}</SubmitButton>
              </ActionForm>
            )}
            <LinkButton href="/dashboard/orders/new">Create an order</LinkButton>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Completed orders", stats.completedOrders],
          ["Completion rate", pct(stats.completionRate)],
          ["Cancellation rate", pct(stats.cancellationRate)],
          ["Avg. offer response", stats.avgResponseMinutes == null ? "—" : stats.avgResponseMinutes < 60 ? `${Math.round(stats.avgResponseMinutes)} min` : `${(stats.avgResponseMinutes / 60).toFixed(1)} h`],
          ["Average rating", stats.avgRating ? stats.avgRating.toFixed(2) : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4">
            <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">{k}</p>
            <p className="mt-1 font-display text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="About" />
            <div className="space-y-4 px-5 py-4 text-sm">
              <p className="whitespace-pre-line text-muted">{profile.bio || "This provider hasn't written a bio yet."}</p>
              {profile.qualifications && (
                <div>
                  <p className="label">Qualifications & experience</p>
                  <p className="whitespace-pre-line text-muted">{profile.qualifications}</p>
                </div>
              )}
              {profile.coachingStyle && (
                <div>
                  <p className="label">Coaching style</p>
                  <p className="whitespace-pre-line text-muted">{profile.coachingStyle}</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={`Reviews (${reviewTotal})`} subtitle="Only customers with a completed order can leave a review." />
            {reviewTotal > 0 && (
              <div className="grid grid-cols-5 gap-2 border-b border-line px-5 py-4">
                {[5, 4, 3, 2, 1].map((r) => (
                  <div key={r} className="text-xs">
                    <p className="text-faint">{r}★</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-panel-2">
                      <div className="h-full bg-red" style={{ width: `${((dist[r] ?? 0) / reviewTotal) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-muted">{dist[r] ?? 0}</p>
                  </div>
                ))}
              </div>
            )}
            {reviews.length === 0 ? (
              <EmptyState title="No reviews yet" body="Reviews appear here after customers complete orders with this provider." />
            ) : (
              <ul className="divide-y divide-line">
                {reviews.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.author.displayName} color={r.author.avatarColor} size={28} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{r.author.displayName}</p>
                        <p className="text-xs text-faint">{r.order.service.name} · {fmtDate(r.createdAt)}</p>
                      </div>
                      <Stars value={r.rating} size={12} />
                    </div>
                    <p className="mt-2 text-sm text-text/90">{r.body}</p>
                    <Badge tone="green" className="mt-2">Verified order</Badge>
                    {r.providerResponse && (
                      <div className="mt-3 rounded-md border-l-2 border-red bg-coal px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-muted">Response from {user.displayName}</p>
                        <p className="mt-1 text-muted">{r.providerResponse}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={page} pages={Math.ceil(reviewTotal / PER_PAGE)} hrefFor={(p) => `/providers/${id}?page=${p}`} />
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="px-5 py-4">
              <DL
                items={[
                  ["Current rank", <span key="c" className="flex items-center gap-2"><RankChip rank={profile.currentRank} />{profile.rankVerified ? <Badge tone="green">Verified</Badge> : <Badge>Self-reported</Badge>}</span>],
                  ["Peak rank", <RankChip key="p" rank={profile.peakRank} />],
                  ["Regions", profile.regions.join(", ") || "—"],
                  ["Languages", profile.languages.join(", ") || "—"],
                  ["Availability", profile.availability || "—"],
                  ["Main agents", profile.agents.join(", ") || "—"],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Services" />
            <ul className="space-y-2 px-5 py-4 text-sm">
              {services.map((s) => <li key={s.slug} className="flex items-center gap-2"><span className="size-1.5 rotate-45 bg-red" />{s.name}</li>)}
            </ul>
          </Card>
          {profile.coachingSpecialties.length > 0 && (
            <Card>
              <CardHeader title="Coaching specialties" />
              <div className="flex flex-wrap gap-1.5 px-5 py-4">
                {profile.coachingSpecialties.map((c) => <Badge key={c} tone="green">{coachingName(c)}</Badge>)}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
