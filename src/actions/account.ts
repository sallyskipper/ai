"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireViewer, revokeOtherSessions, verifyPassword } from "@/lib/auth";
import { UserError, type ActionResult } from "@/lib/errors";
import { REGION_CODES } from "@/lib/valorant";
import { submitApplication, toggleFavorite, updateProviderProfile } from "@/lib/domain/providers";
import { handlePaymentSucceeded, requestPayout } from "@/lib/payments/service";
import { appUrl, gatewayName, stripe } from "@/lib/payments/gateway";
import { notifyAdmins } from "@/lib/notify";
import { run, str, strs } from "./run";

export async function markNotificationReadAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => db.notification.updateMany({ where: { id: str(fd, "id"), userId: v.id, readAt: null }, data: { readAt: new Date() } }));
}

export async function openNotificationAction(fd: FormData) {
  const v = await requireViewer();
  const n = await db.notification.findFirst({ where: { id: str(fd, "id"), userId: v.id } });
  if (!n) return;
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  redirect(n.link.startsWith("/") ? n.link : "/dashboard/notifications");
}

export async function markAllNotificationsReadAction() {
  const v = await requireViewer();
  return run(() => db.notification.updateMany({ where: { userId: v.id, readAt: null }, data: { readAt: new Date() } }), "All notifications marked as read");
}

export async function applyProviderAction(fd: FormData) {
  const v = await requireViewer();
  return run(
    () =>
      submitApplication(v, {
        riotId: str(fd, "riotId"),
        currentRank: str(fd, "currentRank"),
        peakRank: str(fd, "peakRank"),
        regions: strs(fd, "regions"),
        services: strs(fd, "services"),
        experience: str(fd, "experience"),
        trackerUrl: str(fd, "trackerUrl"),
        discordHandle: str(fd, "discordHandle") || undefined,
        agreedToRules: fd.get("agreedToRules") === "on",
      }),
    "Application submitted",
  );
}

export async function updateProviderProfileAction(fd: FormData) {
  const v = await requireViewer();
  return run(
    () =>
      updateProviderProfile(v, {
        bio: str(fd, "bio"),
        qualifications: str(fd, "qualifications"),
        coachingStyle: str(fd, "coachingStyle"),
        availability: str(fd, "availability"),
        currentRank: str(fd, "currentRank"),
        regions: strs(fd, "regions"),
        supportedServices: strs(fd, "supportedServices"),
        coachingSpecialties: strs(fd, "coachingSpecialties"),
        agents: strs(fd, "agents"),
        languages: str(fd, "languages").split(",").map((s) => s.trim()).filter(Boolean),
      }),
    "Profile saved",
  );
}

export async function toggleFavoriteAction(fd: FormData) {
  const v = await requireViewer();
  return run(async () => {
    const added = await toggleFavorite(v, str(fd, "providerId"));
    return added;
  });
}

export async function requestPayoutAction() {
  const v = await requireViewer();
  return run(() => requestPayout(v), "Payout sent");
}

/** Starts or resumes Stripe Connect Express onboarding for payouts. */
export async function connectPayoutAccountAction(): Promise<ActionResult> {
  const v = await requireViewer();
  const res = await run(async () => {
    if (v.role !== "PROVIDER" || v.providerStatus !== "APPROVED") throw new UserError("Only approved providers can connect payouts", 403);
    if (gatewayName() !== "stripe") throw new UserError("Payout accounts are connected through Stripe. Sandbox mode pays out automatically.");
    const profile = await db.providerProfile.findUniqueOrThrow({ where: { userId: v.id } });
    let accountId = profile.stripeAccountId;
    if (!accountId) {
      const acct = await stripe().accounts.create(
        { type: "express", email: v.email, capabilities: { transfers: { requested: true } }, metadata: { userId: v.id } },
        { idempotencyKey: `connect_${v.id}` },
      );
      accountId = acct.id;
      await db.providerProfile.update({ where: { userId: v.id }, data: { stripeAccountId: accountId } });
    }
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${appUrl()}/dashboard/payouts`,
      return_url: `${appUrl()}/dashboard/payouts?connected=1`,
    });
    return link.url;
  });
  if (!res.ok) return res;
  redirect(res.data!);
}

/** Development-only: simulates the gateway confirming a sandbox payment. */
export async function simulateSandboxPaymentAction(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  const paymentId = str(fd, "paymentId");
  const res = await run(async () => {
    const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment || payment.provider !== "sandbox" || payment.order.customerId !== v.id) throw new UserError("Payment not found", 404);
    gatewayName(); // throws in production
    if (fd.get("outcome") === "fail") {
      await db.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED" } });
      return payment.orderId;
    }
    await handlePaymentSucceeded({
      eventId: `sbx_evt_${paymentId}`,
      provider: "sandbox",
      paymentId,
      amountCents: payment.amountCents,
      paymentIntentId: null,
      payload: { simulatedBy: v.id },
    });
    return payment.orderId;
  });
  if (!res.ok) return res;
  redirect(`/dashboard/orders/${res.data}?checkout=${fd.get("outcome") === "fail" ? "cancelled" : "success"}`);
}

export async function createSupportTicketAction(fd: FormData) {
  const v = await requireViewer();
  return run(async () => {
    const subject = str(fd, "subject");
    const body = str(fd, "body");
    if (subject.length < 4 || body.length < 10) throw new UserError("Add a subject and describe the issue");
    const orderId = str(fd, "orderId") || null;
    if (orderId) {
      const o = await db.order.findFirst({ where: { id: orderId, OR: [{ customerId: v.id }, { providerId: v.id }] } });
      if (!o) throw new UserError("Order not found");
    }
    await db.$transaction(async (tx) => {
      await tx.supportTicket.create({ data: { userId: v.id, subject: subject.slice(0, 120), body: body.slice(0, 4000), orderId } });
      await notifyAdmins(tx, "ORDER_UPDATE", "New support ticket", subject.slice(0, 120), "/admin/support");
    });
  }, "Ticket submitted. Our team will reply by email.");
}

const accountSchema = z.object({
  displayName: z.string().trim().min(3).max(24).regex(/^[\w .-]+$/, "Letters, numbers, spaces, . _ - only"),
  region: z.enum(REGION_CODES as [string, ...string[]]),
});

export async function updateAccountAction(fd: FormData) {
  const v = await requireViewer();
  return run(async () => {
    const parsed = accountSchema.safeParse({ displayName: str(fd, "displayName"), region: str(fd, "region") });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    await db.user.update({ where: { id: v.id }, data: parsed.data });
  }, "Account updated");
}

export async function changePasswordAction(fd: FormData) {
  const v = await requireViewer();
  return run(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: v.id } });
    if (!(await verifyPassword(String(fd.get("current") ?? ""), user.passwordHash))) throw new UserError("Current password is incorrect");
    const next = String(fd.get("next") ?? "");
    if (next.length < 10) throw new UserError("New password must be at least 10 characters");
    await db.user.update({ where: { id: v.id }, data: { passwordHash: await hashPassword(next) } });
    await revokeOtherSessions(v.id);
  }, "Password changed. Other sessions were signed out.");
}
