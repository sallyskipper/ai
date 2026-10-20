import type { OrderStatus } from "@prisma/client";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadByOrder } from "@/lib/domain/messages";
import { OrderTable, orderRowInclude } from "@/components/order-table";
import { Card, EmptyState, PageHeader, Pagination } from "@/components/ui";

export const metadata = { title: "Completed orders" };
const PER_PAGE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const viewer = await requireViewer();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const statuses: OrderStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED"] as OrderStatus[];
  const where = { providerId: viewer.id, status: { in: statuses } };
  const [orders, total, unread] = await Promise.all([
    db.order.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: orderRowInclude }),
    db.order.count({ where }),
    unreadByOrder(viewer.id),
  ]);
  return (
    <>
      <PageHeader title="Completed orders" subtitle="Finished, refunded and cancelled orders." />
      <Card>
        {orders.length ? <OrderTable orders={orders} unread={unread} show="customer" /> : <EmptyState title="No completed orders yet" />}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `/dashboard/completed?page=${p}`} />
      </Card>
    </>
  );
}
