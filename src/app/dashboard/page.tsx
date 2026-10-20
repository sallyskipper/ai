import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer, type Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { unreadByOrder } from "@/lib/domain/messages";
import { providerStats } from "@/lib/domain/reviews";
import { providerBalances } from "@/lib/payments/service";
import { ACTIVE_STATUSES } from "@/lib/domain/order-machine";
import { OrderTable, orderRowInclude } from "@/components/order-table";
import { NotificationList } from "@/components/notification-list";
import { Card, CardHeader, EmptyState, LinkButton, Notice, PageHeader, StatCard, Stars, fmtDate, pct } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const viewer = await requireViewer();
  if (viewer.role === "ADMIN") redirect("/admin");
  return viewer.role === "PROVIDER" ? <ProviderOverview viewer={viewer} /> : <CustomerOverview viewer={viewer} />;
}

async function CustomerOverview({ viewer }: { viewer: Viewer }) {
  const [active, awaitingSelection, newOffers, awaitingConfirmation, awaitingPayment, recent, activity, unread] = await Promise.all([
    db.order.count({ where: { customerId: viewer.id, status: { in: ACTIVE_STATUSES } } }),
    db.order.count({ where: { customerId: viewer.id, status: { in: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"] } } }),
    db.offer.count({ where: { status: "ACTIVE", order: { customerId: viewer.id, status: "OFFERS_RECEIVED" } } }),
    db.order.count({ where: { customerId: viewer.id, status: "AWAITING_CUSTOMER_CONFIRMATION" } }),
    db.order.count({ where: { customerId: viewer.id, status: "AWAITING_PAYMENT" } }),
    db.order.findMany({ where: { customerId: viewer.id }, orderBy: { updatedAt: "desc" }, take: 8, include: orderRowInclude }),
    db.notification.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    unreadByOrder(viewer.id),
  ]);
  const unreadMessages = [...unread.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${viewer.displayName}`}
        subtitle="Here's what's happening with your orders."
        actions={<LinkButton href="/dashboard/orders/new">+ Create order</LinkButton>}
      />
      {awaitingConfirmation > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {awaitingConfirmation} order{awaitingConfirmation > 1 ? "s are" : " is"} waiting for you to confirm completion.{" "}
            <Link className="font-semibold underline" href="/dashboard/orders?filter=confirm">Review now</Link>
          </Notice>
        </div>
      )}
      {awaitingPayment > 0 && (
        <div className="mb-4">
          <Notice tone="info">
            {awaitingPayment} order{awaitingPayment > 1 ? "s are" : " is"} awaiting payment. Your provider is assigned once payment is confirmed.{" "}
            <Link className="font-semibold underline" href="/dashboard/orders?filter=payment">Pay now</Link>
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Active orders" value={active} href="/dashboard/orders?filter=active" accent />
        <StatCard label="Awaiting selection" value={awaitingSelection} hint="Open for offers" href="/dashboard/orders?filter=open" />
        <StatCard label="New offers" value={newOffers} href="/dashboard/offers" />
        <StatCard label="Unread messages" value={unreadMessages} href="/dashboard/messages" />
        <StatCard label="Awaiting confirmation" value={awaitingConfirmation} href="/dashboard/orders?filter=confirm" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Recent orders" action={<LinkButton href="/dashboard/orders" variant="ghost" size="sm">View all</LinkButton>} />
          {recent.length ? (
            <OrderTable orders={recent} unread={unread} />
          ) : (
            <EmptyState title="No orders yet" body="Create your first order to start receiving offers from vetted providers." action={<LinkButton href="/dashboard/orders/new">Create order</LinkButton>} />
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<LinkButton href="/dashboard/notifications" variant="ghost" size="sm">All</LinkButton>} />
          {activity.length ? <NotificationList items={activity} compact /> : <EmptyState title="Nothing yet" body="Order updates and offers will show up here." />}
        </Card>
      </div>
    </>
  );
}

async function ProviderOverview({ viewer }: { viewer: Viewer }) {
  const approved = viewer.providerStatus === "APPROVED";
  const profile = await db.providerProfile.findUnique({ where: { userId: viewer.id } });
  const matchWhere = {
    status: { in: ["OPEN_FOR_OFFERS" as const, "OFFERS_RECEIVED" as const] },
    offers: { none: { providerId: viewer.id } },
    service: { slug: { in: profile?.supportedServices ?? [] } },
    region: { in: profile?.regions ?? [] },
  };
  const [available, offersActive, active, completed, stats, balances, reviews, matches, unread] = await Promise.all([
    approved ? db.order.count({ where: matchWhere }) : 0,
    db.offer.count({ where: { providerId: viewer.id, status: "ACTIVE" } }),
    db.order.count({ where: { providerId: viewer.id, status: { in: ACTIVE_STATUSES } } }),
    db.order.count({ where: { providerId: viewer.id, status: "COMPLETED" } }),
    providerStats(viewer.id),
    providerBalances(viewer.id),
    db.review.findMany({ where: { providerId: viewer.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 4, include: { author: { select: { displayName: true } } } }),
    approved ? db.order.findMany({ where: matchWhere, orderBy: { publishedAt: "desc" }, take: 6, include: orderRowInclude }) : [],
    unreadByOrder(viewer.id),
  ]);

  return (
    <>
      <PageHeader title={`Welcome back, ${viewer.displayName}`} subtitle="Your provider workspace." actions={approved ? <LinkButton href="/dashboard/available">Find orders</LinkButton> : undefined} />
      {!approved && (
        <div className="mb-6">
          <Notice tone="warn">
            {viewer.providerStatus === "PENDING"
              ? "Your application is under review. You'll be able to bid on paid orders once approved."
              : viewer.providerStatus === "SUSPENDED"
                ? "Your provider account is suspended. Contact support for details."
                : viewer.providerStatus === "REJECTED"
                  ? "Your application was not approved. You can review the feedback on the application page."
                  : "Complete your provider application to start bidding on orders."}{" "}
            <Link href="/dashboard/apply" className="font-semibold underline">Application status</Link>
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Matching orders" value={available} href="/dashboard/available" accent />
        <StatCard label="Offers submitted" value={offersActive} hint="Active offers" href="/dashboard/offers" />
        <StatCard label="Active orders" value={active} href="/dashboard/active" />
        <StatCard label="Completed orders" value={completed} href="/dashboard/completed" />
        <StatCard label="Average rating" value={stats.avgRating ? stats.avgRating.toFixed(2) : "—"} hint={`${stats.reviewCount} verified reviews`} href="/dashboard/reviews" />
        <StatCard label="Completion rate" value={pct(stats.completionRate)} href="/dashboard/performance" />
        <StatCard label="Pending earnings" value={formatCents(balances.pending + balances.held)} hint={balances.held ? `${formatCents(balances.held)} held in disputes` : "Released on confirmation"} href="/dashboard/earnings" />
        <StatCard label="Available earnings" value={formatCents(balances.available)} href="/dashboard/payouts" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="New orders matching your profile" subtitle="Based on your services and regions" action={<LinkButton href="/dashboard/available" variant="ghost" size="sm">View all</LinkButton>} />
          {matches.length ? <OrderTable orders={matches} unread={unread} show="customer" /> : <EmptyState title="No matching orders right now" body="New orders in your services and regions will appear here." />}
        </Card>
        <Card>
          <CardHeader title="Recent reviews" />
          {reviews.length ? (
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <Stars value={r.rating} size={12} />
                    <span className="text-xs text-faint">{fmtDate(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{r.body}</p>
                  <p className="mt-1 text-xs text-faint">— {r.author.displayName}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No reviews yet" body="Customers can review you after confirming a completed order." />
          )}
        </Card>
      </div>
    </>
  );
}
