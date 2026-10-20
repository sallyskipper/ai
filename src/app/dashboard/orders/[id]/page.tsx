import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getOrderForViewer } from "@/lib/domain/orders";
import { markConversationRead } from "@/lib/domain/messages";
import { STATUS_LABELS } from "@/lib/domain/order-machine";
import { coachingName } from "@/lib/valorant";
import * as A from "@/actions/orders";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { MessageThread } from "@/components/message-thread";
import { OffersCompare, eta } from "@/components/offers-compare";
import { Avatar, Badge, Card, CardHeader, DL, LinkButton, Notice, RankChip, ServiceBadge, Stars, StatusBadge, Tabs, VerifiedBadge, clsx, fmtDate } from "@/components/ui";

export const metadata = { title: "Order" };

const STEPS: { label: string; reached: OrderStatus[] }[] = [
  { label: "Posted", reached: ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED", "AWAITING_PAYMENT", "ASSIGNED", "IN_PROGRESS", "COMPLETION_SUBMITTED", "AWAITING_CUSTOMER_CONFIRMATION", "COMPLETED"] },
  { label: "Provider chosen", reached: ["AWAITING_PAYMENT", "ASSIGNED", "IN_PROGRESS", "COMPLETION_SUBMITTED", "AWAITING_CUSTOMER_CONFIRMATION", "COMPLETED"] },
  { label: "Paid", reached: ["ASSIGNED", "IN_PROGRESS", "COMPLETION_SUBMITTED", "AWAITING_CUSTOMER_CONFIRMATION", "COMPLETED"] },
  { label: "In progress", reached: ["IN_PROGRESS", "COMPLETION_SUBMITTED", "AWAITING_CUSTOMER_CONFIRMATION", "COMPLETED"] },
  { label: "Delivered", reached: ["AWAITING_CUSTOMER_CONFIRMATION", "COMPLETED"] },
  { label: "Completed", reached: ["COMPLETED"] },
];

const REFUND_RULES = (
  <ul className="list-disc space-y-1 pl-4">
    <li>Before payment: cancel at any time, nothing is charged.</li>
    <li>After payment: the other party must accept the cancellation. Accepted cancellations are refunded in full to your original payment method.</li>
    <li>If you can&apos;t agree, open a dispute — funds stay on hold until Redline support decides.</li>
  </ul>
);

function detailItems(kind: string, d: Record<string, unknown>): [string, React.ReactNode][] {
  if (kind === "COACHING")
    return [
      ["Coaching type", coachingName(String(d.coachingType))],
      ["Current rank", <RankChip key="r" rank={String(d.currentRank)} />],
      ["Sessions", `${d.sessions} × ${d.sessionMinutes} minutes`],
      ["Agent focus", (d.agent as string) || "Any"],
      ["Map focus", (d.map as string) || "Any"],
      ["Goals", String(d.goals ?? "—")],
    ];
  if (kind === "DUO_RANK_UP")
    return [
      ["Current rank", <RankChip key="c" rank={String(d.currentRank)} />],
      ["Goal", d.mode === "GAMES" ? `${d.games} games together` : <RankChip key="t" rank={String(d.targetRank)} />],
      ["Server", String(d.server ?? "—")],
      ["Play schedule", String(d.schedule ?? "—")],
      ["Communication", (d.communication as string[] | undefined)?.join(", ") ?? "—"],
      ["Account", "Customer plays on own account"],
    ];
  return [
    ["Current rank", <RankChip key="c" rank={String(d.currentRank)} />],
    ["Desired rank", <RankChip key="t" rank={String(d.desiredRank)} />],
    ["Queue", String(d.queue)],
    ["Timeframe", `${d.timeframeDays} days`],
    ["Preferences", (d.preferences as string[] | undefined)?.join(", ") || "None"],
  ];
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const order = await getOrderForViewer(viewer, id);
  if (!order) notFound();

  const isCustomer = viewer.id === order.customerId;
  const isProvider = !!order.providerId && viewer.id === order.providerId;
  const isAdmin = viewer.role === "ADMIN";
  const isBidder = viewer.role === "PROVIDER" && !isProvider;
  const myOffer = isBidder || isProvider ? await db.offer.findUnique({ where: { orderId_providerId: { orderId: id, providerId: viewer.id } } }) : null;
  const canMessage = !!order.conversation && (isCustomer || isProvider || isAdmin);
  const showOffers = isCustomer || isAdmin;

  const tab = sp.tab ?? (isCustomer && order.status === "OFFERS_RECEIVED" ? "offers" : "overview");
  if (tab === "messages" && order.conversation && (isCustomer || isProvider)) await markConversationRead(viewer.id, order.conversation.id);
  const unread = order.conversation && (isCustomer || isProvider) && tab !== "messages"
    ? await db.message.count({
        where: {
          conversationId: order.conversation.id,
          senderId: { not: viewer.id },
          createdAt: { gt: (await db.conversationRead.findUnique({ where: { conversationId_userId: { conversationId: order.conversation.id, userId: viewer.id } } }))?.lastReadAt ?? new Date(0) },
        },
      })
    : 0;

  const base = `/dashboard/orders/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: `${base}?tab=overview` },
    ...(showOffers ? [{ key: "offers", label: "Offers", href: `${base}?tab=offers`, count: order._count.offers }] : []),
    ...(canMessage ? [{ key: "messages", label: "Messages", href: `${base}?tab=messages`, count: unread }] : []),
    { key: "timeline", label: "Timeline", href: `${base}?tab=timeline` },
  ];

  const details = order.details as Record<string, unknown>;
  const terminal = ["CANCELLED", "REFUNDED", "DISPUTED", "CANCELLATION_REQUESTED"].includes(order.status);
  const openDispute = order.disputes.find((d) => d.status === "OPEN");
  const succeededPayment = order.payments.find((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED");

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={isProvider || isBidder ? "/dashboard/active" : isAdmin ? "/admin/orders" : "/dashboard/orders"} className="text-xs text-muted hover:text-text">← Back to orders</Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-faint">#{order.number}</span>
            <ServiceBadge kind={order.service.kind} />
            <StatusBadge status={order.status} />
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold">{order.title}</h1>
          <p className="mt-1 text-xs text-muted">Created {fmtDate(order.createdAt)} · Region {order.region}{order.deadline && <> · Deadline {fmtDate(order.deadline)}</>}</p>
        </div>
        {isAdmin && <LinkButton href={`/admin/orders?q=${order.number}`} variant="secondary" size="sm">Admin record</LinkButton>}
      </div>

      {sp.checkout === "success" && order.status === "AWAITING_PAYMENT" && (
        <div className="mb-4"><Notice tone="info">We&apos;re waiting for the payment provider to confirm your payment. This page updates once it&apos;s verified — a browser redirect alone never marks an order paid.</Notice></div>
      )}
      {sp.checkout === "success" && order.status === "ASSIGNED" && <div className="mb-4"><Notice tone="ok">Payment confirmed. Your provider has been assigned.</Notice></div>}
      {sp.checkout === "cancelled" && order.status === "AWAITING_PAYMENT" && <div className="mb-4"><Notice tone="warn">Payment was not completed. You can try again below.</Notice></div>}

      {/* Progress */}
      {!terminal && order.status !== "DRAFT" && (
        <div className="card mb-5 overflow-x-auto px-5 py-4">
          <ol className="flex min-w-[600px] items-center">
            {STEPS.map((s, i) => {
              const done = s.reached.includes(order.status);
              const current = done && (i === STEPS.length - 1 || !STEPS[i + 1].reached.includes(order.status));
              return (
                <li key={s.label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex items-center gap-2">
                    <span className={clsx("flex size-6 items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-red text-white" : "border border-line-strong text-faint", current && "ring-4 ring-red/25")}>{done ? "✓" : i + 1}</span>
                    <span className={clsx("text-xs font-medium whitespace-nowrap", done ? "text-text" : "text-faint")}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <span className={clsx("mx-3 h-px flex-1", STEPS[i + 1].reached.includes(order.status) ? "bg-red" : "bg-line")} />}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {order.status === "DISPUTED" && <div className="mb-5"><Notice tone="danger">This order is under dispute. Funds are on hold until Redline support resolves it.{openDispute && <> Reason: “{openDispute.reason}”</>}</Notice></div>}
      {order.status === "CANCELLATION_REQUESTED" && (
        <div className="mb-5"><Notice tone="warn">Cancellation requested{order.cancelRequestedById === viewer.id ? " by you — waiting for the other party." : "."} Reason: “{order.cancelReason}”</Notice></div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <Tabs tabs={tabs} active={tab} />

          {tab === "overview" && (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Service requirements" />
                <div className="px-5 py-4"><DL items={detailItems(order.service.kind, details)} /></div>
                {order.notes && (
                  <div className="border-t border-line px-5 py-4">
                    <p className="label">Additional requirements</p>
                    <p className="text-sm whitespace-pre-line text-muted">{order.notes}</p>
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Service rules" />
                <p className="px-5 py-4 text-sm whitespace-pre-line text-muted">{order.service.rules}</p>
              </Card>
              {order.acceptedOffer && (
                <Card>
                  <CardHeader title="Accepted offer" />
                  <div className="px-5 py-4">
                    <DL items={[["Agreed price", formatCents(order.agreedPriceCents)], ["Estimated completion", eta(order.acceptedOffer.etaHours)], ["Offer accepted", fmtDate(order.acceptedOffer.updatedAt)]]} />
                    <p className="mt-4 rounded-md border border-line bg-coal px-3 py-2 text-sm text-muted">{order.acceptedOffer.message}</p>
                  </div>
                </Card>
              )}
              {order.completionNote && (
                <Card>
                  <CardHeader title="Completion submitted" subtitle={fmtDate(order.completionSubmittedAt)} />
                  <p className="px-5 py-4 text-sm whitespace-pre-line text-muted">{order.completionNote}</p>
                </Card>
              )}
              {order.review && (
                <Card>
                  <CardHeader title="Your verified review" />
                  <div className="px-5 py-4">
                    <Stars value={order.review.rating} />
                    <p className="mt-2 text-sm">{order.review.body}</p>
                    {order.review.providerResponse && <p className="mt-3 border-l-2 border-red pl-3 text-sm text-muted">Provider response: {order.review.providerResponse}</p>}
                  </div>
                </Card>
              )}
              {isBidder && <BidPanel order={order} myOffer={myOffer} />}
            </div>
          )}

          {tab === "offers" && showOffers && (
            <Card>
              <OffersCompare orderId={id} canAccept={isCustomer && order.status === "OFFERS_RECEIVED"} sort={sp.sort ?? "experience"} hrefBase={`${base}?tab=offers`} />
            </Card>
          )}

          {tab === "messages" && canMessage && (
            <Card>
              <CardHeader title="Order conversation" subtitle="Private to you, your provider and Redline staff. Never share passwords." />
              <MessageThread orderId={id} viewerId={viewer.id} canSend={(isCustomer || isProvider || isAdmin) && !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status) || isAdmin} />
            </Card>
          )}

          {tab === "timeline" && (
            <Card>
              <CardHeader title="Status timeline" />
              <ol className="relative px-5 py-4">
                {order.events.map((e, i) => (
                  <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < order.events.length - 1 && <span className="absolute top-4 left-[5px] h-full w-px bg-line" />}
                    <span className={clsx("relative mt-1.5 size-[11px] shrink-0 rounded-full border-2", i === order.events.length - 1 ? "border-red bg-red" : "border-line-strong bg-ink")} />
                    <div>
                      <p className="text-sm font-medium">{e.message}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        {fmtDate(e.createdAt)}
                        {e.toStatus && <> · {STATUS_LABELS[e.toStatus]}</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <ActionsPanel order={order} viewerId={viewer.id} isCustomer={isCustomer} isProvider={isProvider} />

          <Card>
            <CardHeader title="Pricing" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <Row k="Minimum accepted price" v={formatCents(order.minPriceCents)} />
              {order.budgetCents && <Row k="Customer budget" v={formatCents(order.budgetCents)} />}
              {order.agreedPriceCents && <Row k="Agreed price" v={<b className="text-text">{formatCents(order.agreedPriceCents)}</b>} />}
              {(isProvider || isAdmin) && order.agreedPriceCents && (
                <>
                  <Row k={`Platform fee (${(order.commissionBps ?? 0) / 100}%)`} v={`− ${formatCents(order.platformFeeCents)}`} />
                  <Row k="Provider net earnings" v={<b className="text-ok">{formatCents(order.providerNetCents)}</b>} />
                </>
              )}
              <p className="pt-2 text-xs text-faint">The minimum and agreed price are locked to this order and don&apos;t change if pricing is updated later.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Participants" />
            <div className="space-y-4 px-5 py-4">
              <Person label="Customer" user={order.customer} />
              {order.provider ? (
                <Person label="Provider" user={order.provider} href={`/providers/${order.provider.id}`} verified />
              ) : (
                <p className="text-sm text-muted">No provider selected yet.</p>
              )}
            </div>
          </Card>

          {(isCustomer || isProvider || isAdmin) && order.payments.length > 0 && (
            <Card>
              <CardHeader title="Payment" />
              <ul className="divide-y divide-line text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p>{formatCents(p.amountCents)} {p.provider === "sandbox" && <Badge tone="amber">Sandbox</Badge>}</p>
                      <p className="text-xs text-faint">{fmtDate(p.createdAt)}</p>
                    </div>
                    <Badge tone={p.status === "SUCCEEDED" ? "green" : p.status === "FAILED" ? "gray" : p.status === "PENDING" ? "amber" : "blue"}>{p.status.replace("_", " ").toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
              {succeededPayment && order.status !== "COMPLETED" && order.status !== "REFUNDED" && (
                <p className="border-t border-line px-5 py-3 text-xs text-faint">Funds are held by Redline and released to the provider after the customer confirms completion.</p>
              )}
            </Card>
          )}

          {(isCustomer || isProvider) && (
            <Card>
              <CardHeader title="Need help?" />
              <div className="px-5 py-4 text-sm text-muted">
                <p>Questions about this order? Our support team can step in.</p>
                <LinkButton href={`/dashboard/support?order=${order.id}`} variant="secondary" size="sm" className="mt-3">Contact support</LinkButton>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function Person({ label, user, href, verified }: { label: string; user: { displayName: string; avatarColor: string }; href?: string; verified?: boolean }) {
  const inner = (
    <div className="flex items-center gap-3">
      <Avatar name={user.displayName} color={user.avatarColor} size={36} />
      <div>
        <p className="text-xs text-faint">{label}</p>
        <p className="flex items-center gap-2 text-sm font-medium">{user.displayName}{verified && <VerifiedBadge />}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

type FullOrder = NonNullable<Awaited<ReturnType<typeof getOrderForViewer>>>;

function ActionsPanel({ order, viewerId, isCustomer, isProvider }: { order: FullOrder; viewerId: string; isCustomer: boolean; isProvider: boolean }) {
  const h = { orderId: order.id };
  const s = order.status;
  const items: React.ReactNode[] = [];
  const requestedByMe = order.cancelRequestedById === viewerId;

  if (isCustomer) {
    if (s === "DRAFT")
      items.push(
        <ActionForm key="pub" action={A.publishOrderAction}><input type="hidden" name="orderId" value={order.id} /><SubmitButton className="w-full">Publish for offers</SubmitButton></ActionForm>,
      );
    if (s === "OFFERS_RECEIVED") items.push(<LinkButton key="cmp" href={`/dashboard/orders/${order.id}?tab=offers`} className="w-full">Compare {order._count.offers} offer{order._count.offers === 1 ? "" : "s"}</LinkButton>);
    if (s === "OPEN_FOR_OFFERS") items.push(<p key="wait" className="text-sm text-muted">Waiting for offers from approved providers. We&apos;ll notify you when one arrives.</p>);
    if (s === "AWAITING_PAYMENT") {
      items.push(
        <ActionForm key="pay" action={A.payNowAction}><input type="hidden" name="orderId" value={order.id} /><SubmitButton className="w-full" pendingText="Opening checkout…">Pay {formatCents(order.agreedPriceCents)}</SubmitButton></ActionForm>,
        <ConfirmAction key="chg" action={A.changeSelectionAction} hidden={h} variant="secondary" label="Choose a different provider" title="Reopen provider selection?" body={<p>The selected provider will be released and you can choose another offer. Nothing has been charged.</p>} confirmLabel="Reopen selection" />,
      );
    }
    if (["DRAFT", "OPEN_FOR_OFFERS", "OFFERS_RECEIVED", "AWAITING_PAYMENT"].includes(s))
      items.push(<ConfirmAction key="cancel" action={A.cancelOrderAction} hidden={h} label="Cancel order" title="Cancel this order?" body={<><p>All offers will be closed. You haven&apos;t been charged, so no refund is needed.</p>{REFUND_RULES}</>} reason reasonLabel="Reason (optional)" confirmLabel="Cancel order" />);
    if (s === "AWAITING_CUSTOMER_CONFIRMATION") {
      items.push(
        <ConfirmAction key="confirm" action={A.confirmCompletionAction} hidden={h} variant="primary" label="Confirm completion" title="Confirm the order is complete?" body={<p>This releases {formatCents(order.agreedPriceCents)} to your provider and can&apos;t be undone. Only confirm if the work was delivered as agreed. If something is wrong, open a dispute instead.</p>} confirmLabel="Yes, confirm completion" />,
      );
    }
    if (s === "COMPLETED" && !order.review) items.push(<ReviewForm key="review" orderId={order.id} />);
  }

  if (isProvider) {
    if (s === "AWAITING_PAYMENT") items.push(<p key="wp" className="text-sm text-muted">The customer selected your offer. You&apos;ll be assigned once their payment is confirmed.</p>);
    if (s === "ASSIGNED")
      items.push(<ActionForm key="start" action={A.startOrderAction}><input type="hidden" name="orderId" value={order.id} /><SubmitButton className="w-full">Start order</SubmitButton></ActionForm>);
    if (s === "IN_PROGRESS")
      items.push(
        <ConfirmAction key="done" action={A.submitCompletionAction} hidden={h} variant="primary" label="Submit completion" title="Submit completion" body={<p>Describe what you delivered. The customer will be asked to confirm or open a dispute.</p>} confirmLabel="Submit for confirmation">
          <div className="mt-4"><label className="label" htmlFor="note">Completion summary</label><textarea id="note" name="note" rows={4} required minLength={10} className="input" placeholder="e.g. Reached Platinum 1 after 14 duo games; screenshots attached in chat." /></div>
        </ConfirmAction>,
      );
    if (s === "AWAITING_CUSTOMER_CONFIRMATION") items.push(<p key="wc" className="text-sm text-muted">Waiting for the customer to confirm completion.</p>);
  }

  if (isCustomer || isProvider) {
    if (s === "CANCELLATION_REQUESTED" && !requestedByMe)
      items.push(
        <ConfirmAction key="acc" action={A.acceptCancellationAction} hidden={h} variant="secondary" label="Accept cancellation" title="Accept cancellation and refund?" body={<p>The customer will receive a full refund of {formatCents(order.agreedPriceCents)}.{isProvider && " You will not receive earnings for this order."}</p>} confirmLabel="Accept & refund" />,
        <ConfirmAction key="dec" action={A.declineCancellationAction} hidden={h} variant="ghost" label="Decline cancellation" title="Decline the cancellation request?" body={<p>The order returns to its previous state. The other party may open a dispute.</p>} confirmLabel="Decline" />,
      );
    if (["ASSIGNED", "IN_PROGRESS"].includes(s))
      items.push(<ConfirmAction key="rc" action={A.requestCancellationAction} hidden={h} label="Request cancellation" title="Request cancellation" body={<>{REFUND_RULES}</>} reason reasonRequired confirmLabel="Send request" />);
    if (["ASSIGNED", "IN_PROGRESS", "AWAITING_CUSTOMER_CONFIRMATION", "CANCELLATION_REQUESTED"].includes(s))
      items.push(
        <ConfirmAction key="disp" action={A.openDisputeAction} hidden={h} variant="ghost" label="Open a dispute" title="Open a dispute" body={<p>Redline support will review the order, messages and evidence. Funds stay on hold until a decision is made.</p>} reason reasonRequired reasonLabel="What went wrong?" confirmLabel="Open dispute" />,
      );
  }

  if (!items.length) return null;
  return (
    <Card className="border-red/30">
      <CardHeader title="Actions" />
      <div className="flex flex-col gap-2 px-5 py-4 [&_button]:w-full [&_form]:w-full">{items}</div>
    </Card>
  );
}

function ReviewForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={A.createReviewAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm font-semibold">Leave a verified review</p>
      <div className="flex flex-row-reverse justify-end gap-1">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="cursor-pointer text-2xl text-line-strong has-[:checked]:text-red-hot [label:has(:checked)~&]:text-red-hot">
            <input type="radio" name="rating" value={n} required className="sr-only" />★
          </label>
        ))}
      </div>
      <textarea name="body" rows={3} required minLength={10} maxLength={2000} className="input" placeholder="How was your experience?" />
      <SubmitButton className="w-full">Publish review</SubmitButton>
    </ActionForm>
  );
}

function BidPanel({ order, myOffer }: { order: FullOrder; myOffer: { id: string; priceCents: number; etaHours: number; message: string; status: string } | null }) {
  const open = ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"].includes(order.status);
  if (!open && !myOffer) return null;
  return (
    <Card className="border-red/30">
      <CardHeader title={myOffer?.status === "ACTIVE" ? "Your offer" : "Submit an offer"} subtitle={`Minimum accepted price: ${formatCents(order.minPriceCents)} · ${order._count.offers} active offer${order._count.offers === 1 ? "" : "s"}`} />
      {open && (!myOffer || myOffer.status === "ACTIVE" || myOffer.status === "WITHDRAWN") ? (
        <ActionForm action={A.submitOfferAction} className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <input type="hidden" name="orderId" value={order.id} />
          <div>
            <label className="label" htmlFor="price">Your price (USD)</label>
            <input id="price" name="price" inputMode="decimal" required defaultValue={myOffer ? (myOffer.priceCents / 100).toFixed(2) : (order.minPriceCents / 100).toFixed(2)} className="input" />
            <p className="mt-1 text-xs text-faint">At least {formatCents(order.minPriceCents)}</p>
          </div>
          <div>
            <label className="label" htmlFor="etaValue">Estimated completion</label>
            <div className="flex gap-2">
              <input id="etaValue" name="etaValue" type="number" min={1} required defaultValue={myOffer ? (myOffer.etaHours >= 48 ? Math.round(myOffer.etaHours / 24) : myOffer.etaHours) : 2} className="input w-20" />
              <select name="etaUnit" className="input" defaultValue={myOffer && myOffer.etaHours < 48 ? "hours" : "days"}>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="message">Message to customer</label>
            <textarea id="message" name="message" rows={3} required minLength={10} maxLength={1000} defaultValue={myOffer?.message} className="input" placeholder="Your relevant experience, availability and approach." />
          </div>
          <div className="flex items-center gap-2 sm:col-span-3">
            <SubmitButton>{myOffer?.status === "ACTIVE" ? "Update offer" : "Submit offer"}</SubmitButton>
            {myOffer?.status === "ACTIVE" && (
              <ConfirmAction action={A.withdrawOfferAction} hidden={{ offerId: myOffer.id }} variant="ghost" label="Withdraw" title="Withdraw your offer?" body={<p>The customer will no longer see your offer. You can submit a new one while the order is open.</p>} confirmLabel="Withdraw offer" />
            )}
          </div>
        </ActionForm>
      ) : (
        <div className="px-5 py-4 text-sm text-muted">
          {myOffer && <p>Your offer of <b className="text-text">{formatCents(myOffer.priceCents)}</b> is <b className="text-text">{myOffer.status.toLowerCase()}</b>.</p>}
          {!open && <p className="mt-1">This order is no longer accepting offers.</p>}
        </div>
      )}
    </Card>
  );
}
