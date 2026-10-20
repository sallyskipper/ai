import type { Notification } from "@prisma/client";
import clsx from "clsx";
import { openNotificationAction, markNotificationReadAction } from "@/actions/account";
import { Icon } from "./sidebar";
import { timeAgo } from "./ui";

const TYPE_META: Record<string, { icon: Parameters<typeof Icon>[0]["name"]; label: string }> = {
  ORDER_UPDATE: { icon: "list", label: "Order update" },
  NEW_OFFER: { icon: "tag", label: "New offer" },
  NEW_MESSAGE: { icon: "chat", label: "Message" },
  PAYMENT: { icon: "card", label: "Payment" },
  CANCELLATION: { icon: "flag", label: "Cancellation" },
  COMPLETION: { icon: "check", label: "Completion" },
  DISPUTE: { icon: "shield", label: "Dispute" },
  REVIEW: { icon: "star", label: "Review" },
  PAYOUT: { icon: "send", label: "Payout" },
  APPLICATION: { icon: "user", label: "Application" },
};

export function NotificationList({ items, compact }: { items: Notification[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => {
        const meta = TYPE_META[n.type] ?? TYPE_META.ORDER_UPDATE;
        const unread = !n.readAt;
        return (
          <li key={n.id} className={clsx("group relative flex items-start gap-3 px-5 transition-colors hover:bg-panel-2/50", compact ? "py-3" : "py-4", unread && "bg-red/[0.03]")}>
            {unread && <span className="absolute inset-y-0 left-0 w-0.5 bg-red" />}
            <span className={clsx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", unread ? "border-red/40 bg-red/10 text-red-hot" : "border-line bg-coal text-faint")}>
              <Icon name={meta.icon} className="size-4" />
            </span>
            <form action={openNotificationAction} className="min-w-0 flex-1">
              <input type="hidden" name="id" value={n.id} />
              <button className="block w-full text-left">
                <span className="flex items-center gap-2">
                  <span className={clsx("text-sm", unread ? "font-semibold text-text" : "font-medium text-muted")}>{n.title}</span>
                  {!compact && <span className="text-[10px] font-semibold tracking-wider text-faint uppercase">{meta.label}</span>}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                <span className="mt-1 block text-xs text-faint" title={n.createdAt.toISOString()}>{timeAgo(n.createdAt)}</span>
              </button>
            </form>
            {unread && !compact && (
              <form action={async (fd) => { "use server"; await markNotificationReadAction(fd); }}>
                <input type="hidden" name="id" value={n.id} />
                <button className="rounded px-2 py-1 text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text focus:opacity-100">Mark read</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
