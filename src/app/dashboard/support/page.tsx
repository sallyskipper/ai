import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createSupportTicketAction } from "@/actions/account";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const viewer = await requireViewer();
  const { order } = await searchParams;
  const [tickets, orders] = await Promise.all([
    db.supportTicket.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, include: { order: { select: { number: true } } } }),
    db.order.findMany({ where: { OR: [{ customerId: viewer.id }, { providerId: viewer.id }] }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, number: true, title: true } }),
  ]);
  return (
    <>
      <PageHeader title="Support" subtitle="Contact the Redline team. For problems with a paid order, you can also open a dispute from the order page." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="New ticket" />
          <ActionForm action={createSupportTicketAction} resetOnSuccess className="space-y-4 px-5 py-4">
            <div>
              <label className="label" htmlFor="orderId">Related order (optional)</label>
              <select id="orderId" name="orderId" defaultValue={order ?? ""} className="input">
                <option value="">None</option>
                {orders.map((o) => <option key={o.id} value={o.id}>#{o.number} · {o.title}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="subject">Subject</label><input id="subject" name="subject" required minLength={4} maxLength={120} className="input" /></div>
            <div><label className="label" htmlFor="body">How can we help?</label><textarea id="body" name="body" required minLength={10} rows={6} className="input" /></div>
            <SubmitButton>Submit ticket</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Your tickets" />
          {tickets.length === 0 ? (
            <EmptyState title="No tickets" />
          ) : (
            <ul className="divide-y divide-line">
              {tickets.map((t) => (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{t.subject}</p>
                    <Badge tone={t.status === "OPEN" ? "amber" : "gray"}>{t.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-faint">{fmtDate(t.createdAt)}{t.order && ` · Order #${t.order.number}`}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
