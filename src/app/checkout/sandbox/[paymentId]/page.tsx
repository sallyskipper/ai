import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { gatewayName } from "@/lib/payments/gateway";
import { simulateSandboxPaymentAction } from "@/actions/account";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo, Notice } from "@/components/ui";

export const metadata = { title: "Sandbox checkout" };

// Development-only stand-in for the hosted payment page. Refused in production.
export default async function SandboxCheckout({ params }: { params: Promise<{ paymentId: string }> }) {
  const viewer = await requireViewer();
  try { if (gatewayName() !== "sandbox") notFound(); } catch { notFound(); }
  const { paymentId } = await params;
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment || payment.provider !== "sandbox" || payment.order.customerId !== viewer.id) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <Notice tone="warn"><b>Sandbox payment.</b> No real money moves. This page exists only in development to exercise the same server-side confirmation path a real payment webhook uses.</Notice>
          <div className="mt-6 flex items-end justify-between">
            <div><p className="text-xs text-faint">Order #{payment.order.number}</p><p className="font-medium">{payment.order.title}</p></div>
            <p className="font-display text-2xl font-bold">{formatCents(payment.amountCents)}</p>
          </div>
          {payment.status !== "PENDING" ? (
            <p className="mt-6 text-sm text-muted">This payment is already {payment.status.toLowerCase()}.</p>
          ) : (
            <div className="mt-6 space-y-2">
              <ActionForm action={simulateSandboxPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <input type="hidden" name="outcome" value="success" />
                <SubmitButton className="w-full" size="lg">Simulate successful payment</SubmitButton>
              </ActionForm>
              <ActionForm action={simulateSandboxPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <input type="hidden" name="outcome" value="fail" />
                <SubmitButton className="w-full" variant="ghost">Simulate failed payment</SubmitButton>
              </ActionForm>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
