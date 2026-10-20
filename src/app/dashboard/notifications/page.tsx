import type { NotificationType, Prisma } from "@prisma/client";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { markAllNotificationsReadAction } from "@/actions/account";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NotificationList } from "@/components/notification-list";
import { Card, EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui";

export const metadata = { title: "Notifications" };

const FILTERS: Record<string, { label: string; types?: NotificationType[]; unread?: boolean }> = {
  all: { label: "All" },
  unread: { label: "Unread", unread: true },
  orders: { label: "Order updates", types: ["ORDER_UPDATE"] },
  offers: { label: "Offers", types: ["NEW_OFFER"] },
  messages: { label: "Messages", types: ["NEW_MESSAGE"] },
  payments: { label: "Payments", types: ["PAYMENT"] },
  cancellations: { label: "Cancellations", types: ["CANCELLATION"] },
  completions: { label: "Completions", types: ["COMPLETION"] },
  disputes: { label: "Disputes", types: ["DISPUTE"] },
  reviews: { label: "Reviews", types: ["REVIEW"] },
  payouts: { label: "Payouts", types: ["PAYOUT"] },
  applications: { label: "Applications", types: ["APPLICATION"] },
};
const PER_PAGE = 25;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const key = sp.filter && FILTERS[sp.filter] ? sp.filter : "all";
  const f = FILTERS[key];
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.NotificationWhereInput = { userId: viewer.id, ...(f.types ? { type: { in: f.types } } : {}), ...(f.unread ? { readAt: null } : {}) };
  const [items, total, unreadByType] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.notification.count({ where }),
    db.notification.groupBy({ by: ["type"], where: { userId: viewer.id, readAt: null }, _count: true }),
  ]);
  const unreadCount = (types?: NotificationType[]) => unreadByType.filter((u) => !types || types.includes(u.type)).reduce((a, u) => a + u._count, 0);
  const totalUnread = unreadCount();

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={totalUnread ? `${totalUnread} unread` : "You're all caught up."}
        actions={totalUnread > 0 ? <ActionForm action={markAllNotificationsReadAction}><SubmitButton variant="secondary" size="sm">Mark all as read</SubmitButton></ActionForm> : undefined}
      />
      <Tabs active={key} tabs={Object.entries(FILTERS).map(([k, v]) => ({ key: k, label: v.label, href: `/dashboard/notifications?filter=${k}`, count: k === "all" ? undefined : unreadCount(v.types) }))} />
      <Card>
        {items.length ? <NotificationList items={items} /> : <EmptyState title="No notifications" body="Order updates, offers, messages and payments will appear here." />}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `/dashboard/notifications?filter=${key}&page=${p}`} />
      </Card>
    </>
  );
}
