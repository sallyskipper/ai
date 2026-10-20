import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { respondReviewAction } from "@/actions/orders";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, Stars, fmtDate } from "@/components/ui";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const viewer = await requireViewer();
  if (viewer.role === "PROVIDER") {
    const reviews = await db.review.findMany({
      where: { providerId: viewer.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { displayName: true, avatarColor: true } }, order: { select: { id: true, number: true, title: true } } },
    });
    return (
      <>
        <PageHeader title="Reviews" subtitle="Verified reviews from customers with completed orders. You can respond once to each review." />
        <Card>
          {reviews.length === 0 ? (
            <EmptyState title="No reviews yet" body="Customers can review you after they confirm a completed order." />
          ) : (
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={r.author.displayName} color={r.author.avatarColor} size={30} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{r.author.displayName}</p>
                      <Link href={`/dashboard/orders/${r.order.id}`} className="text-xs text-faint hover:text-text">#{r.order.number} · {r.order.title}</Link>
                    </div>
                    {r.status !== "PUBLISHED" && <Badge tone="amber">{r.status.toLowerCase()} by moderation</Badge>}
                    <Stars value={r.rating} />
                    <span className="text-xs text-faint">{fmtDate(r.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm">{r.body}</p>
                  {r.providerResponse ? (
                    <p className="mt-3 border-l-2 border-red pl-3 text-sm text-muted">Your response: {r.providerResponse}</p>
                  ) : (
                    <ActionForm action={respondReviewAction} className="mt-3 flex gap-2">
                      <input type="hidden" name="reviewId" value={r.id} />
                      <input name="response" required minLength={2} maxLength={1000} placeholder="Write a public response…" className="input" />
                      <SubmitButton variant="secondary">Respond</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }
  const [reviews, pending] = await Promise.all([
    db.review.findMany({ where: { authorId: viewer.id }, orderBy: { createdAt: "desc" }, include: { provider: { select: { id: true, displayName: true, avatarColor: true } }, order: { select: { id: true, number: true, title: true } } } }),
    db.order.findMany({ where: { customerId: viewer.id, status: "COMPLETED", review: null }, select: { id: true, number: true, title: true } }),
  ]);
  return (
    <>
      <PageHeader title="My reviews" subtitle="Reviews you've left for providers on completed orders." />
      {pending.length > 0 && (
        <Card className="mb-6">
          <div className="border-b border-line px-5 py-3 text-sm font-semibold">Waiting for your review</div>
          <ul className="divide-y divide-line">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><span className="font-mono text-xs text-faint">#{o.number}</span> {o.title}</span>
                <LinkButton href={`/dashboard/orders/${o.id}`} size="sm">Write review</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" body="After an order is completed you can leave one verified review for the provider." />
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="px-5 py-5">
                <div className="flex items-center gap-3">
                  <Avatar name={r.provider.displayName} color={r.provider.avatarColor} size={30} />
                  <div className="flex-1">
                    <Link href={`/providers/${r.provider.id}`} className="text-sm font-medium hover:text-red-hot">{r.provider.displayName}</Link>
                    <p className="text-xs text-faint">#{r.order.number} · {r.order.title}</p>
                  </div>
                  <Stars value={r.rating} />
                </div>
                <p className="mt-3 text-sm">{r.body}</p>
                {r.providerResponse && <p className="mt-3 border-l-2 border-red pl-3 text-sm text-muted">Provider response: {r.providerResponse}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
