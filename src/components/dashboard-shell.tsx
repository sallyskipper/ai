import Link from "next/link";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { logoutAction } from "@/actions/auth";
import { unreadByOrder } from "@/lib/domain/messages";
import { Sidebar, type NavSection } from "./sidebar";
import { NotificationPoller } from "./live-badge";
import { BellIcon } from "./public-nav";
import { Avatar, Badge, Logo } from "./ui";

async function navFor(viewer: Viewer, unreadNotifications: number): Promise<NavSection[]> {
  const unreadMessages = [...(await unreadByOrder(viewer.id)).values()].reduce((a, b) => a + b, 0);
  if (viewer.role === "ADMIN") {
    const [apps, disputes, tickets] = await Promise.all([
      db.providerApplication.count({ where: { status: "SUBMITTED" } }),
      db.dispute.count({ where: { status: "OPEN" } }),
      db.supportTicket.count({ where: { status: "OPEN" } }),
    ]);
    return [
      { items: [{ href: "/admin", label: "Platform overview", icon: "chart", exact: true }] },
      {
        title: "People",
        items: [
          { href: "/admin/users", label: "Users", icon: "users" },
          { href: "/admin/applications", label: "Provider approvals", icon: "shield", count: apps },
          { href: "/admin/reviews", label: "Review moderation", icon: "star" },
        ],
      },
      {
        title: "Marketplace",
        items: [
          { href: "/admin/orders", label: "Orders & offers", icon: "list" },
          { href: "/admin/disputes", label: "Cancellations & disputes", icon: "flag", count: disputes },
          { href: "/admin/support", label: "Support tickets", icon: "help", count: tickets },
        ],
      },
      {
        title: "Configuration",
        items: [
          { href: "/admin/pricing", label: "Minimum prices", icon: "tag" },
          { href: "/admin/services", label: "Service catalog", icon: "layers" },
          { href: "/admin/settings", label: "Commission & fees", icon: "dollar" },
        ],
      },
      {
        title: "Finance & audit",
        items: [
          { href: "/admin/payments", label: "Payments & payouts", icon: "wallet" },
          { href: "/admin/audit", label: "Audit log", icon: "file" },
          { href: "/dashboard/notifications", label: "Notifications", icon: "bell", count: unreadNotifications },
        ],
      },
    ];
  }
  if (viewer.role === "PROVIDER") {
    const approved = viewer.providerStatus === "APPROVED";
    const available = approved
      ? await db.order.count({ where: { status: { in: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"] }, offers: { none: { providerId: viewer.id } }, customerId: { not: viewer.id } } })
      : 0;
    const active = await db.order.count({ where: { providerId: viewer.id, status: { in: ["ASSIGNED", "IN_PROGRESS", "CANCELLATION_REQUESTED", "DISPUTED"] } } });
    return [
      {
        items: [
          { href: "/dashboard", label: "Overview", icon: "home", exact: true },
          ...(!approved ? [{ href: "/dashboard/apply", label: "Provider application", icon: "shield" as const }] : []),
          { href: "/dashboard/available", label: "Available Orders", icon: "search", count: available },
          { href: "/dashboard/offers", label: "My Offers", icon: "tag" },
          { href: "/dashboard/active", label: "Active Orders", icon: "bolt", count: active },
          { href: "/dashboard/completed", label: "Completed Orders", icon: "check" },
        ],
      },
      {
        title: "Communication",
        items: [
          { href: "/dashboard/messages", label: "Messages", icon: "chat", count: unreadMessages },
          { href: "/dashboard/notifications", label: "Notifications", icon: "bell", count: unreadNotifications },
        ],
      },
      {
        title: "Profile & money",
        items: [
          { href: "/dashboard/profile", label: "My Profile", icon: "user" },
          { href: "/dashboard/reviews", label: "Reviews", icon: "star" },
          { href: "/dashboard/earnings", label: "Earnings", icon: "wallet" },
          { href: "/dashboard/payouts", label: "Payouts", icon: "send" },
          { href: "/dashboard/performance", label: "Performance", icon: "chart" },
          { href: "/dashboard/settings", label: "Settings", icon: "gear" },
        ],
      },
    ];
  }
  const newOffers = await db.offer.count({ where: { status: "ACTIVE", order: { customerId: viewer.id, status: "OFFERS_RECEIVED" } } });
  return [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "home", exact: true },
        { href: "/dashboard/browse", label: "Browse Services", icon: "grid" },
        { href: "/dashboard/orders/new", label: "Create Order", icon: "plus" },
        { href: "/dashboard/orders", label: "My Orders", icon: "list" },
        { href: "/dashboard/offers", label: "Offers Received", icon: "tag", count: newOffers },
      ],
    },
    {
      title: "Communication",
      items: [
        { href: "/dashboard/messages", label: "Messages", icon: "chat", count: unreadMessages },
        { href: "/dashboard/notifications", label: "Notifications", icon: "bell", count: unreadNotifications },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/dashboard/favorites", label: "Favorite Providers", icon: "heart" },
        { href: "/dashboard/reviews", label: "My Reviews", icon: "star" },
        { href: "/dashboard/payments", label: "Payments", icon: "card" },
        { href: "/dashboard/support", label: "Support", icon: "help" },
        { href: "/dashboard/settings", label: "Settings", icon: "gear" },
      ],
    },
  ];
}

const ROLE_LABEL = { CUSTOMER: "Customer", PROVIDER: "Provider", ADMIN: "Administrator" } as const;

export async function DashboardShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const unread = await db.notification.count({ where: { userId: viewer.id, readAt: null } });
  const sections = await navFor(viewer, unread);

  const header = (
    <div className="border-b border-line px-5 py-4">
      <Logo />
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-panel p-2.5">
        <Avatar name={viewer.displayName} color={viewer.avatarColor} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{viewer.displayName}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            {ROLE_LABEL[viewer.role]}
            {viewer.role === "PROVIDER" && viewer.providerStatus !== "APPROVED" && <Badge tone="amber">{viewer.providerStatus ?? "Not applied"}</Badge>}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar sections={sections} header={header} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur-md sm:px-6">
          <Link href="/" className="text-sm text-muted hover:text-text">← Marketplace</Link>
          <div className="ml-auto flex items-center gap-1">
            {viewer.role === "CUSTOMER" && (
              <Link href="/dashboard/orders/new" className="mr-2 hidden h-8 items-center rounded-md bg-red px-3 text-xs font-semibold text-white hover:bg-red-hot sm:inline-flex">
                + New order
              </Link>
            )}
            {viewer.role === "ADMIN" && (
              <Link href="/admin" className="mr-2 hidden text-xs text-muted hover:text-text sm:inline">Admin</Link>
            )}
            <Link href="/dashboard/notifications" className="relative rounded-md p-2 text-muted hover:bg-panel hover:text-text" aria-label={`Notifications (${unread} unread)`}>
              <BellIcon />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red px-1 text-center text-[10px] leading-4 font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <form action={logoutAction}>
              <button className="rounded-md px-3 py-2 text-xs font-medium text-muted hover:bg-panel hover:text-text">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <NotificationPoller initial={unread} />
    </div>
  );
}
