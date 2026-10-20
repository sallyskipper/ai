import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { withdrawOfferAction } from "@/actions/orders";
import { ConfirmAction } from "@/components/forms";
import { eta } from "@/components/offers-compare";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, ServiceBadge, StatusBadge, Tabs, VerifiedBadge, timeAgo } from "@/components/ui";

export const metadata = { title: "Offers" };

const OFFER_TONE = { ACTIVE: "blue", ACCEPTED: "green", DECLINED: "gray", WITHDRAWN: "gray" } as const;

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const viewer = await requireViewer();
  const { status = "ACTIVE" } = await searchParams;
  const valid = ["ACTIVE", "ACCEPTED", "DECLINED", "WITHDRAWN"].includes(status) ? (status as "ACTIVE") : "ACTIVE";

  if (viewer.role === "PROVIDER") {
    const [offers, counts] = await Promise.all([
      db.offer.findMany({
        where: { providerId: viewer.id, status: valid },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { order: { include: { service: true, customer: { select: { displayName: true, avatarColor: true } } } } },
      }),
      db.offer.groupBy({ by: ["status"], where: { providerId: viewer.id }, _count: true }),
    ]);
    const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
    return (
      <>
        <PageHeader title="My offers" subtitle="Offers you've submitted on customer orders." actions={<LinkButton href="/dashboard/available">Find orders</LinkButton>} />
        <Tabs active={valid} tabs={["ACTIVE", "ACCEPTED", "DECLINED", "WITHDRAWN"].map((s) => ({ key: s, label: s[0] + s.slice(1).toLowerCase(), href: `/dashboard/offers?status=${s}`, count: c(s) }))} />
        <Card>
          {offers.length === 0 ? (
            <EmptyState title="No offers here" body="Browse available orders and submit offers at or above the minimum price." action={<LinkButton href="/dashboard/available">Available orders</LinkButton>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-[760px]">
                <thead><tr><th>Order</th><th>Service</th><th>Order status</th><th className="text-right">Minimum</th><th className="text-right">Your price</th><th>ETA</th><th></th></tr></thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/dashboard/orders/${o.orderId}`} className="hover:text-red-hot"><span className="font-mono text-xs text-faint">#{o.order.number}</span><span className="block font-medium">{o.order.title}</span></Link></td>
                      <td><ServiceBadge kind={o.order.service.kind} /></td>
                      <td><StatusBadge status={o.order.status} /></td>
                      <td className="text-right text-muted tabular-nums">{formatCents(o.order.minPriceCents)}</td>
                      <td className="text-right font-semibold tabular-nums">{formatCents(o.priceCents)}</td>
                      <td className="text-muted">{eta(o.etaHours)}</td>
                      <td className="text-right">
                        {o.status === "ACTIVE" && (
                          <ConfirmAction action={withdrawOfferAction} hidden={{ offerId: o.id }} variant="ghost" size="sm" label="Withdraw" title="Withdraw offer?" body={<p>The customer will no longer see this offer.</p>} confirmLabel="Withdraw" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  // Customer: offers received, grouped by order.
  const orders = await db.order.findMany({
    where: { customerId: viewer.id, offers: { some: {} }, status: { in: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED", "AWAITING_PAYMENT"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      service: true,
      offers: { where: { status: { in: ["ACTIVE", "ACCEPTED"] } }, orderBy: { priceCents: "asc" }, include: { provider: { select: { displayName: true, avatarColor: true } } } },
    },
  });
  return (
    <>
      <PageHeader title="Offers received" subtitle="Compare offers and choose the provider you trust. Nothing is awarded automatically." />
      {orders.length === 0 ? (
        <Card><EmptyState title="No offers waiting" body="Offers on your open orders will appear here." action={<LinkButton href="/dashboard/orders/new">Create order</LinkButton>} /></Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-faint">#{o.number}</span><ServiceBadge kind={o.service.kind} /><StatusBadge status={o.status} /></div>
                  <p className="mt-1 font-semibold">{o.title}</p>
                  <p className="text-xs text-muted">Minimum {formatCents(o.minPriceCents)}{o.budgetCents ? ` · Budget ${formatCents(o.budgetCents)}` : ""}</p>
                </div>
                <LinkButton href={`/dashboard/orders/${o.id}?tab=offers`} size="sm">Compare {o.offers.length} offer{o.offers.length === 1 ? "" : "s"}</LinkButton>
              </div>
              <ul className="divide-y divide-line">
                {o.offers.slice(0, 4).map((of) => (
                  <li key={of.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={of.provider.displayName} color={of.provider.avatarColor} size={28} />
                    <span className="flex items-center gap-2 text-sm font-medium">{of.provider.displayName}<VerifiedBadge /></span>
                    {of.status !== "ACTIVE" && <Badge tone={OFFER_TONE[of.status]}>{of.status.toLowerCase()}</Badge>}
                    <span className="ml-auto text-xs text-faint">{timeAgo(of.createdAt)}</span>
                    <span className="w-24 text-right font-semibold tabular-nums">{formatCents(of.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
