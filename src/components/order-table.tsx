import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { formatCents } from "@/lib/money";
import { Avatar, ServiceBadge, StatusBadge, timeAgo } from "./ui";

export type OrderRow = {
  id: string;
  number: number;
  title: string;
  status: OrderStatus;
  region: string;
  minPriceCents: number;
  agreedPriceCents: number | null;
  budgetCents?: number | null;
  deadline?: Date | null;
  updatedAt: Date;
  service: { kind: string };
  provider?: { displayName: string; avatarColor: string } | null;
  customer?: { displayName: string; avatarColor: string } | null;
  _count?: { offers: number };
};

export function OrderTable({
  orders,
  unread,
  show = "provider",
  hrefBase = "/dashboard/orders",
}: {
  orders: OrderRow[];
  unread?: Map<string, number>;
  show?: "provider" | "customer" | "both";
  hrefBase?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[760px]">
        <thead>
          <tr>
            <th>Order</th>
            <th>Service</th>
            <th>Status</th>
            {(show === "provider" || show === "both") && <th>Provider</th>}
            {(show === "customer" || show === "both") && <th>Customer</th>}
            <th className="text-right">Price</th>
            <th className="text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const who = (u?: { displayName: string; avatarColor: string } | null, placeholder = "—") =>
              u ? (
                <span className="flex items-center gap-2"><Avatar name={u.displayName} color={u.avatarColor} size={22} />{u.displayName}</span>
              ) : (
                <span className="text-faint">{placeholder}</span>
              );
            const n = unread?.get(o.id) ?? 0;
            return (
              <tr key={o.id} className="relative cursor-pointer">
                <td>
                  <Link href={`${hrefBase}/${o.id}`} className="after:absolute after:inset-0">
                    <span className="font-mono text-xs text-faint">#{o.number}</span>
                    <span className="mt-0.5 flex items-center gap-2 font-medium">
                      {o.title}
                      {n > 0 && <span className="rounded bg-red px-1.5 text-[10px] font-bold text-white">{n} new</span>}
                    </span>
                  </Link>
                </td>
                <td><ServiceBadge kind={o.service.kind} /></td>
                <td>
                  <StatusBadge status={o.status} />
                  {o._count && o._count.offers > 0 && ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"].includes(o.status) && (
                    <span className="ml-2 text-xs text-muted">{o._count.offers} offer{o._count.offers === 1 ? "" : "s"}</span>
                  )}
                </td>
                {(show === "provider" || show === "both") && <td>{who(o.provider, "Not assigned")}</td>}
                {(show === "customer" || show === "both") && <td>{who(o.customer)}</td>}
                <td className="text-right tabular-nums">
                  {o.agreedPriceCents ? (
                    <span className="font-semibold">{formatCents(o.agreedPriceCents)}</span>
                  ) : (
                    <span className="text-muted">min {formatCents(o.minPriceCents)}</span>
                  )}
                </td>
                <td className="text-right text-xs text-muted">{timeAgo(o.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const orderRowInclude = {
  service: { select: { kind: true } },
  provider: { select: { displayName: true, avatarColor: true } },
  customer: { select: { displayName: true, avatarColor: true } },
  _count: { select: { offers: { where: { status: "ACTIVE" as const } } } },
};
