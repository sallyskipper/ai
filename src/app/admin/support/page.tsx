import Link from "next/link";
import { db } from "@/lib/db";
import { closeTicketAction } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Support tickets" };

export default async function SupportAdmin() {
  const tickets = await db.supportTicket.findMany({ orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 100, include: { user: { select: { displayName: true, email: true } }, order: { select: { id: true, number: true } } } });
  return (
    <>
      <PageHeader title="Support tickets" subtitle="Reply to customers by email; close tickets when handled." />
      <Card>
        {tickets.length === 0 ? <EmptyState title="No tickets" /> : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">{t.subject}<Badge tone={t.status === "OPEN" ? "amber" : "gray"}>{t.status.toLowerCase()}</Badge></p>
                  <p className="mt-0.5 text-xs text-faint">{t.user.displayName} · <a href={`mailto:${t.user.email}`} className="hover:text-text">{t.user.email}</a> · {fmtDate(t.createdAt)}{t.order && <> · <Link href={`/dashboard/orders/${t.order.id}`} className="hover:text-text">Order #{t.order.number}</Link></>}</p>
                  <p className="mt-2 text-sm whitespace-pre-line text-muted">{t.body}</p>
                </div>
                {t.status === "OPEN" && <ActionForm action={closeTicketAction}><input type="hidden" name="ticketId" value={t.id} /><SubmitButton size="sm" variant="secondary">Close</SubmitButton></ActionForm>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
