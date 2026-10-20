import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { moderateReviewAction } from "@/actions/admin";
import { ConfirmAction } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, Pagination, Stars, Tabs, fmtDate } from "@/components/ui";

export const metadata = { title: "Review moderation" };
const PER_PAGE = 25;

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; provider?: string }> }) {
  const sp = await searchParams;
  const status = ["PUBLISHED", "FLAGGED", "REMOVED"].includes(sp.status ?? "") ? (sp.status as "PUBLISHED" | "FLAGGED" | "REMOVED") : ("PUBLISHED" as "PUBLISHED" | "FLAGGED" | "REMOVED");
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ReviewWhereInput = { status, ...(sp.provider ? { providerId: sp.provider } : {}) };
  const [reviews, total, counts] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        author: { select: { displayName: true, email: true, createdAt: true, _count: { select: { reviewsWritten: true } } } },
        provider: { select: { id: true, displayName: true } },
        order: { select: { id: true, number: true, agreedPriceCents: true, assignedAt: true, completedAt: true } },
      },
    }),
    db.review.count({ where }),
    db.review.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Review moderation" subtitle="Investigate fraudulent or abusive reviews. Flagged and removed reviews are hidden from public profiles." />
      <Tabs active={status} tabs={["PUBLISHED", "FLAGGED", "REMOVED"].map((s) => ({ key: s, label: s[0] + s.slice(1).toLowerCase(), href: `?status=${s}`, count: s === "FLAGGED" ? c(s) : undefined }))} />
      <Card>
        {reviews.length === 0 ? <EmptyState title="No reviews" /> : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => {
              const quick = r.order.assignedAt && r.order.completedAt && r.order.completedAt.getTime() - r.order.assignedAt.getTime() < 15 * 60_000;
              const newAccount = r.createdAt.getTime() - r.author.createdAt.getTime() < 86400_000;
              return (
                <li key={r.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_260px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Stars value={r.rating} size={12} />
                      <span className="font-medium">{r.author.displayName}</span>
                      <span className="text-faint">→</span>
                      <Link href={`?status=${status}&provider=${r.provider.id}`} className="font-medium hover:text-red-hot">{r.provider.displayName}</Link>
                      <span className="text-xs text-faint">{fmtDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm">{r.body}</p>
                    {r.moderationNote && <p className="mt-2 text-xs text-warn">Moderation note: {r.moderationNote}</p>}
                  </div>
                  <div className="space-y-2 text-xs">
                    <p className="text-muted">Order <Link href={`/dashboard/orders/${r.order.id}`} className="font-mono hover:text-text">#{r.order.number}</Link> · {r.author.email}</p>
                    <div className="flex flex-wrap gap-1">
                      {quick && <Badge tone="red">Completed &lt;15 min after assignment</Badge>}
                      {newAccount && <Badge tone="amber">Author account &lt;24h old</Badge>}
                      <Badge>{r.author._count.reviewsWritten} reviews by author</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {status !== "PUBLISHED" && <ConfirmAction action={moderateReviewAction} hidden={{ reviewId: r.id, status: "PUBLISHED" }} variant="secondary" size="sm" label="Restore" title="Restore review?" reason confirmLabel="Restore" />}
                      {status !== "FLAGGED" && <ConfirmAction action={moderateReviewAction} hidden={{ reviewId: r.id, status: "FLAGGED" }} variant="outline" size="sm" label="Flag" title="Flag for investigation?" body={<p>The review is hidden while you investigate.</p>} reason reasonRequired reasonLabel="Note" confirmLabel="Flag" />}
                      {status !== "REMOVED" && <ConfirmAction action={moderateReviewAction} hidden={{ reviewId: r.id, status: "REMOVED" }} size="sm" label="Remove" title="Remove review?" reason reasonRequired reasonLabel="Reason" confirmLabel="Remove" />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `?status=${status}&page=${p}`} />
      </Card>
    </>
  );
}
