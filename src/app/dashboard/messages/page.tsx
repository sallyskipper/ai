import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadByOrder } from "@/lib/domain/messages";
import { Avatar, Card, EmptyState, PageHeader, StatusBadge, clsx, timeAgo } from "@/components/ui";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const viewer = await requireViewer();
  const [conversations, unread] = await Promise.all([
    db.conversation.findMany({
      where: { order: { OR: [{ customerId: viewer.id }, { providerId: viewer.id }] } },
      include: {
        order: { select: { id: true, number: true, title: true, status: true, customerId: true, customer: { select: { displayName: true, avatarColor: true } }, provider: { select: { displayName: true, avatarColor: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { displayName: true } } } },
      },
      take: 200,
    }),
    unreadByOrder(viewer.id),
  ]);
  const sorted = conversations.sort((a, b) => (b.messages[0]?.createdAt ?? b.createdAt).getTime() - (a.messages[0]?.createdAt ?? a.createdAt).getTime());

  return (
    <>
      <PageHeader title="Messages" subtitle="Each order has its own private conversation." />
      <Card>
        {sorted.length === 0 ? (
          <EmptyState title="No conversations yet" body="A private conversation opens when an order is paid and assigned." />
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((c) => {
              const other = viewer.id === c.order.customerId ? c.order.provider : c.order.customer;
              const last = c.messages[0];
              const n = unread.get(c.order.id) ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`/dashboard/orders/${c.order.id}?tab=messages`} className={clsx("flex items-center gap-4 px-5 py-4 transition-colors hover:bg-panel-2/50", n > 0 && "bg-red/[0.03]")}>
                    <Avatar name={other?.displayName ?? "?"} color={other?.avatarColor} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={clsx("text-sm", n ? "font-semibold" : "font-medium")}>{other?.displayName}</span>
                        <span className="font-mono text-xs text-faint">#{c.order.number}</span>
                        <StatusBadge status={c.order.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted">{last ? `${last.sender.displayName}: ${last.body || "📎 Attachment"}` : c.order.title}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-faint">{timeAgo(last?.createdAt ?? c.createdAt)}</span>
                      {n > 0 && <span className="rounded bg-red px-1.5 text-[11px] font-bold text-white">{n}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
