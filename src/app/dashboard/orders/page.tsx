import type { OrderStatus, Prisma } from "@prisma/client";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadByOrder } from "@/lib/domain/messages";
import { ACTIVE_STATUSES, CLOSED_STATUSES, OPEN_STATUSES } from "@/lib/domain/order-machine";
import { OrderTable, orderRowInclude } from "@/components/order-table";
import { Card, EmptyState, LinkButton, PageHeader, Pagination, Tabs } from "@/components/ui";

export const metadata = { title: "My orders" };

const FILTERS: Record<string, { label: string; statuses?: OrderStatus[] }> = {
  all: { label: "All" },
  open: { label: "Awaiting selection", statuses: OPEN_STATUSES },
  payment: { label: "Awaiting payment", statuses: ["AWAITING_PAYMENT"] },
  active: { label: "Active", statuses: ACTIVE_STATUSES },
  confirm: { label: "Awaiting confirmation", statuses: ["AWAITING_CUSTOMER_CONFIRMATION"] },
  closed: { label: "Closed", statuses: CLOSED_STATUSES },
  draft: { label: "Drafts", statuses: ["DRAFT"] },
};
const PER_PAGE = 20;

export default async function MyOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const filter = FILTERS[sp.filter ?? "all"] ? (sp.filter ?? "all") : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const own: Prisma.OrderWhereInput = viewer.role === "PROVIDER" ? { providerId: viewer.id } : { customerId: viewer.id };
  const where: Prisma.OrderWhereInput = { ...own, ...(FILTERS[filter].statuses ? { status: { in: FILTERS[filter].statuses } } : {}) };
  const [orders, total, counts, unread] = await Promise.all([
    db.order.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: orderRowInclude }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: own, _count: true }),
    unreadByOrder(viewer.id),
  ]);
  const countFor = (s?: OrderStatus[]) => counts.filter((c) => !s || s.includes(c.status)).reduce((a, c) => a + c._count, 0);

  return (
    <>
      <PageHeader title="My orders" subtitle="Track every order from posting to completion." actions={viewer.role === "CUSTOMER" ? <LinkButton href="/dashboard/orders/new">+ Create order</LinkButton> : undefined} />
      <Tabs active={filter} tabs={Object.entries(FILTERS).map(([key, f]) => ({ key, label: f.label, href: `/dashboard/orders?filter=${key}`, count: key === "all" ? undefined : countFor(f.statuses) }))} />
      <Card>
        {orders.length ? (
          <>
            <OrderTable orders={orders} unread={unread} show={viewer.role === "PROVIDER" ? "customer" : "provider"} />
            <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `/dashboard/orders?filter=${filter}&page=${p}`} />
          </>
        ) : (
          <EmptyState title="No orders here" body={filter === "all" ? "When you create an order it will appear here." : "No orders match this filter."} action={viewer.role === "CUSTOMER" ? <LinkButton href="/dashboard/orders/new">Create order</LinkButton> : undefined} />
        )}
      </Card>
    </>
  );
}
