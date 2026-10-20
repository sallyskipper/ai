import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { providerStats } from "@/lib/domain/reviews";
import { acceptOfferAction } from "@/actions/orders";
import { ConfirmAction } from "./forms";
import { Avatar, Badge, EmptyState, RankChip, Stars, VerifiedBadge, pct, timeAgo } from "./ui";

export function eta(hours: number) {
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** Side-by-side comparison of eligible offers. The customer picks; nothing is auto-awarded. */
export async function OffersCompare({ orderId, canAccept, sort, hrefBase }: { orderId: string; canAccept: boolean; sort: string; hrefBase: string }) {
  const offers = await db.offer.findMany({
    where: { orderId, status: { in: ["ACTIVE", "ACCEPTED"] }, provider: { status: "ACTIVE", providerProfile: { status: "APPROVED" } } },
    include: { provider: { select: { id: true, displayName: true, avatarColor: true, providerProfile: true } } },
  });
  if (!offers.length) return <EmptyState title="No offers yet" body="Approved providers are notified about new orders. You'll get a notification as soon as an offer arrives." />;

  const rows = await Promise.all(offers.map(async (o) => ({ ...o, stats: await providerStats(o.providerId) })));
  const sorted = [...rows].sort((a, b) => {
    if (sort === "price") return a.priceCents - b.priceCents;
    if (sort === "eta") return a.etaHours - b.etaHours;
    if (sort === "rating") return (b.stats.avgRating ?? 0) - (a.stats.avgRating ?? 0) || b.stats.reviewCount - a.stats.reviewCount;
    // Default: experience first — completed orders, then rating.
    return b.stats.completedOrders - a.stats.completedOrders || (b.stats.avgRating ?? 0) - (a.stats.avgRating ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-xs">
        <span className="text-faint">Sort by</span>
        {[["experience", "Experience"], ["rating", "Rating"], ["price", "Price"], ["eta", "Fastest"]].map(([k, l]) => (
          <Link key={k} href={`${hrefBase}&sort=${k}`} className={`rounded-md px-2.5 py-1 font-medium ${sort === k ? "bg-red/15 text-red-hot" : "text-muted hover:bg-panel-2 hover:text-text"}`}>{l}</Link>
        ))}
        <span className="ml-auto text-faint">{offers.length} offer{offers.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((o) => {
          const p = o.provider.providerProfile!;
          return (
            <li key={o.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto]">
              <div className="flex gap-3">
                <Avatar name={o.provider.displayName} color={o.provider.avatarColor} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/providers/${o.provider.id}`} target="_blank" className="font-semibold hover:text-red-hot">{o.provider.displayName}</Link>
                    <VerifiedBadge />
                    {o.status === "ACCEPTED" && <Badge tone="green">Selected</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1.5"><Stars value={o.stats.avgRating} size={12} />{o.stats.avgRating ? o.stats.avgRating.toFixed(1) : "New"}</span>
                    <span>{o.stats.reviewCount} verified review{o.stats.reviewCount === 1 ? "" : "s"}</span>
                    <span>{o.stats.completedOrders} completed</span>
                    <span>Completion {pct(o.stats.completionRate)}</span>
                    <span className="flex items-center gap-1">Rank <RankChip rank={p.currentRank} />{p.rankVerified && <Badge tone="green">Verified</Badge>}</span>
                  </div>
                  <p className="mt-3 rounded-md border border-line bg-coal px-3 py-2 text-sm text-text/90">{o.message}</p>
                  <p className="mt-2 text-xs text-faint">Offered {timeAgo(o.createdAt)}</p>
                </div>
              </div>
              <div className="flex flex-row items-center justify-between gap-4 md:flex-col md:items-end md:justify-start">
                <div className="text-right">
                  <p className="font-display text-2xl font-bold tabular-nums">{formatCents(o.priceCents)}</p>
                  <p className="text-xs text-muted">Est. {eta(o.etaHours)}</p>
                </div>
                {canAccept && o.status === "ACTIVE" && (
                  <ConfirmAction
                    action={acceptOfferAction}
                    hidden={{ offerId: o.id }}
                    variant="primary"
                    label="Choose provider"
                    title={`Choose ${o.provider.displayName}?`}
                    confirmLabel={`Continue to payment · ${formatCents(o.priceCents)}`}
                    body={
                      <>
                        <p>Other offers will be closed and {o.provider.displayName} will be reserved for this order. The agreed price is locked at <b className="text-text">{formatCents(o.priceCents)}</b>.</p>
                        <p>You&apos;ll be taken to secure checkout. The provider is assigned only after payment is confirmed. Funds are released to the provider only after you confirm completion.</p>
                        <p>Changed your mind before paying? You can reopen selection from the order page.</p>
                      </>
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
