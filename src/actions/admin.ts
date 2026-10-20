"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { parseDollars } from "@/lib/money";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { TIERS } from "@/lib/valorant";
import { reviewApplication, setProviderStatus } from "@/lib/domain/providers";
import { moderateReview } from "@/lib/domain/reviews";
import { cancelOrder, resolveDisputeRelease } from "@/lib/domain/orders";
import { acceptCancellation, resolveDisputeRefund } from "@/lib/payments/service";
import { run, str } from "./run";

// Every admin action re-verifies the ADMIN role on the server.
const admin = () => requireRole("ADMIN");

function cents(fd: FormData, key: string) {
  const c = parseDollars(str(fd, key));
  if (c === undefined || Number.isNaN(c) || c <= 0) throw new UserError("Enter a valid positive amount");
  return c;
}

export async function reviewApplicationAction(fd: FormData) {
  const a = await admin();
  const decision = str(fd, "decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  return run(
    () => reviewApplication(a, str(fd, "applicationId"), decision, str(fd, "reason"), fd.get("rankVerified") === "on"),
    decision === "APPROVED" ? "Provider approved" : "Application rejected",
  );
}

export async function setProviderStatusAction(fd: FormData) {
  const a = await admin();
  const status = str(fd, "status") === "APPROVED" ? "APPROVED" : "SUSPENDED";
  return run(() => setProviderStatus(a, str(fd, "userId"), status, str(fd, "reason")), status === "SUSPENDED" ? "Provider suspended" : "Provider reinstated");
}

export async function setRankVerifiedAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const userId = str(fd, "userId");
    const verified = str(fd, "verified") === "true";
    await db.$transaction(async (tx) => {
      await tx.providerProfile.update({ where: { userId }, data: { rankVerified: verified } });
      await audit(tx, a.id, verified ? "provider.rank_verified" : "provider.rank_unverified", "User", userId);
    });
  }, "Rank verification updated");
}

export async function setUserStatusAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const userId = str(fd, "userId");
    if (userId === a.id) throw new UserError("You cannot suspend yourself");
    const status = str(fd, "status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId } });
      await audit(tx, a.id, `user.${status.toLowerCase()}`, "User", userId, { reason: str(fd, "reason") });
    });
  }, "User updated");
}

export async function savePricingRuleAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const amountCents = cents(fd, "amount");
    const id = str(fd, "ruleId");
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.pricingRule.findUniqueOrThrow({ where: { id } });
        await tx.pricingRule.update({ where: { id }, data: { amountCents, active: fd.get("active") !== "off" } });
        await audit(tx, a.id, "pricing.update", "PricingRule", id, { from: before.amountCents, to: amountCents });
      } else {
        const unit = str(fd, "unit");
        if (!["DIVISION", "GAME", "HOUR"].includes(unit)) throw new UserError("Invalid unit");
        const tier = str(fd, "tier") || null;
        if (tier && !(TIERS as readonly string[]).includes(tier)) throw new UserError("Invalid tier");
        const rule = await tx.pricingRule.create({
          data: { serviceId: str(fd, "serviceId"), unit: unit as "DIVISION", tier, variant: str(fd, "variant") || null, amountCents },
        });
        await audit(tx, a.id, "pricing.create", "PricingRule", rule.id, { amountCents, unit, tier });
      }
    });
  }, "Pricing saved. Existing orders keep their original minimum.");
}

export async function togglePricingRuleAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const id = str(fd, "ruleId");
    await db.$transaction(async (tx) => {
      const rule = await tx.pricingRule.findUniqueOrThrow({ where: { id } });
      await tx.pricingRule.update({ where: { id }, data: { active: !rule.active } });
      await audit(tx, a.id, rule.active ? "pricing.deactivate" : "pricing.activate", "PricingRule", id);
    });
  });
}

export async function updateServiceAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const id = str(fd, "serviceId");
    const floorPriceCents = cents(fd, "floor");
    const enabled = fd.get("enabled") === "on";
    await db.$transaction(async (tx) => {
      const svc = await tx.service.findUniqueOrThrow({ where: { id } });
      if (enabled && svc.accountOperated && !svc.complianceReviewedAt)
        throw new UserError("Record the compliance review before enabling an account-operated service");
      await tx.service.update({
        where: { id },
        data: { floorPriceCents, enabled, tagline: str(fd, "tagline") || svc.tagline, rules: str(fd, "rules") || svc.rules },
      });
      await audit(tx, a.id, "service.update", "Service", id, { floorPriceCents, enabled });
    });
  }, "Service updated");
}

export async function recordComplianceReviewAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const note = str(fd, "note");
    if (note.length < 20) throw new UserError("Document the publisher and payment-provider review (at least 20 characters)");
    if (fd.get("confirm") !== "on") throw new UserError("Confirm that both reviews were completed");
    const id = str(fd, "serviceId");
    await db.$transaction(async (tx) => {
      await tx.service.update({ where: { id }, data: { complianceReviewedAt: new Date(), complianceNote: note } });
      await audit(tx, a.id, "service.compliance_reviewed", "Service", id, { note });
    });
  }, "Compliance review recorded");
}

export async function revokeComplianceAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const id = str(fd, "serviceId");
    await db.$transaction(async (tx) => {
      await tx.service.update({ where: { id }, data: { complianceReviewedAt: null, enabled: false } });
      await audit(tx, a.id, "service.compliance_revoked", "Service", id);
    });
  }, "Compliance approval revoked and service disabled");
}

export async function updateSettingsAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const values: Partial<Record<SettingKey, string>> = {};
    const bps = Math.round(Number(str(fd, "commissionPct")) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 5000) throw new UserError("Commission must be between 0% and 50%");
    values.commissionBps = String(bps);
    const hold = Number(str(fd, "payoutHoldHours"));
    if (!Number.isInteger(hold) || hold < 0 || hold > 24 * 30) throw new UserError("Hold must be 0–720 hours");
    values.payoutHoldHours = String(hold);
    values.minPayoutCents = String(cents(fd, "minPayout"));
    await db.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in SETTING_DEFAULTS)) continue;
        await tx.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }
      await audit(tx, a.id, "settings.update", "PlatformSetting", "platform", values);
    });
  }, "Settings saved. New rates apply to offers accepted from now on.");
}

export async function resolveDisputeAction(fd: FormData) {
  const a = await admin();
  const resolution = str(fd, "reason");
  return run(async () => {
    if (resolution.length < 5) throw new UserError("Explain the resolution");
    if (str(fd, "outcome") === "refund") await resolveDisputeRefund(a, str(fd, "orderId"), resolution);
    else await resolveDisputeRelease(a, str(fd, "orderId"), resolution);
  }, "Dispute resolved");
}

export async function adminCancelOrderAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const order = await db.order.findUniqueOrThrow({ where: { id: str(fd, "orderId") } });
    if (order.status === "CANCELLATION_REQUESTED") await acceptCancellation(a, order.id);
    else await cancelOrder(a, order.id, str(fd, "reason"));
  }, "Order cancelled");
}

export async function moderateReviewAction(fd: FormData) {
  const a = await admin();
  const status = str(fd, "status");
  if (!["PUBLISHED", "FLAGGED", "REMOVED"].includes(status)) return { ok: false as const, error: "Invalid status" };
  return run(() => moderateReview(a, str(fd, "reviewId"), status as "FLAGGED", str(fd, "reason")), "Review updated");
}

export async function closeTicketAction(fd: FormData) {
  const a = await admin();
  return run(async () => {
    const id = str(fd, "ticketId");
    await db.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data: { status: "CLOSED" } });
      await audit(tx, a.id, "support.close", "SupportTicket", id);
    });
  }, "Ticket closed");
}
