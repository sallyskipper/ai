import { z } from "zod";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notify";
import { AGENTS, COACHING_CODES, REGION_CODES, isRank } from "@/lib/valorant";
import type { ActorRef } from "./transition";

export const applicationSchema = z.object({
  riotId: z.string().trim().regex(/^.{3,16}#[A-Za-z0-9]{3,5}$/, "Riot ID must look like Name#TAG"),
  currentRank: z.string().refine(isRank, "Choose your current rank"),
  peakRank: z.string().refine(isRank, "Choose your peak rank"),
  regions: z.array(z.enum(REGION_CODES as [string, ...string[]])).min(1, "Choose at least one region"),
  services: z.array(z.string()).min(1, "Choose at least one service"),
  experience: z.string().trim().min(50, "Describe your experience (at least 50 characters)").max(3000),
  trackerUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("").transform(() => undefined)),
  discordHandle: z.string().trim().max(40).optional(),
  agreedToRules: z.literal(true, { message: "You must agree to the provider rules" }),
});

export async function submitApplication(user: ActorRef, input: unknown) {
  if (user.role !== "PROVIDER") throw new UserError("Register a provider account to apply", 403);
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const services = await db.service.findMany({ where: { slug: { in: parsed.data.services } }, select: { slug: true } });
  if (services.length !== parsed.data.services.length) throw new UserError("Unknown service selected");

  return db.$transaction(async (tx) => {
    const open = await tx.providerApplication.findFirst({ where: { userId: user.id, status: "SUBMITTED" } });
    if (open) throw new UserError("You already have an application under review");
    const profile = await tx.providerProfile.findUnique({ where: { userId: user.id } });
    if (profile?.status === "APPROVED") throw new UserError("You are already an approved provider");
    if (profile?.status === "SUSPENDED") throw new UserError("Your provider account is suspended. Contact support.");
    const app = await tx.providerApplication.create({ data: { userId: user.id, ...parsed.data } });
    await tx.providerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: "PENDING", regions: parsed.data.regions, supportedServices: parsed.data.services, currentRank: parsed.data.currentRank, peakRank: parsed.data.peakRank, coachingSpecialties: [], agents: [], languages: [] },
      update: { status: "PENDING" },
    });
    await notifyAdmins(tx, "APPLICATION", "New provider application", `A provider application is waiting for review.`, "/admin/applications");
    await notify(tx, user.id, "APPLICATION", "Application received", "We'll review your application and verify your details.", "/dashboard/apply");
    return app;
  });
}

export async function reviewApplication(admin: ActorRef, applicationId: string, decision: "APPROVED" | "REJECTED", note: string, rankVerified: boolean) {
  if (admin.role !== "ADMIN") throw new UserError("Admins only", 403);
  await db.$transaction(async (tx) => {
    const app = await tx.providerApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new UserError("Application not found", 404);
    if (app.status !== "SUBMITTED") throw new UserError("Application already reviewed");
    await tx.providerApplication.update({
      where: { id: applicationId },
      data: { status: decision, reviewNote: note || null, reviewedById: admin.id, reviewedAt: new Date() },
    });
    if (decision === "APPROVED") {
      await tx.providerProfile.update({
        where: { userId: app.userId },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          regions: app.regions,
          supportedServices: app.services,
          currentRank: app.currentRank,
          peakRank: app.peakRank,
          rankVerified,
          qualifications: app.experience.slice(0, 1000),
        },
      });
    } else {
      await tx.providerProfile.update({ where: { userId: app.userId }, data: { status: "REJECTED" } });
    }
    await audit(tx, admin.id, `application.${decision.toLowerCase()}`, "ProviderApplication", applicationId, { note, rankVerified });
    await notify(
      tx,
      app.userId,
      "APPLICATION",
      decision === "APPROVED" ? "Application approved" : "Application not approved",
      decision === "APPROVED"
        ? "You're now a verified Redline provider. Complete your profile and start bidding."
        : `Your application was not approved.${note ? ` Note: ${note}` : ""}`,
      decision === "APPROVED" ? "/dashboard/profile" : "/dashboard/apply",
    );
  });
}

export async function setProviderStatus(admin: ActorRef, userId: string, status: "APPROVED" | "SUSPENDED", reason: string) {
  if (admin.role !== "ADMIN") throw new UserError("Admins only", 403);
  await db.$transaction(async (tx) => {
    const profile = await tx.providerProfile.findUnique({ where: { userId } });
    if (!profile) throw new UserError("Provider profile not found", 404);
    await tx.providerProfile.update({ where: { userId }, data: { status } });
    if (status === "SUSPENDED")
      await tx.offer.updateMany({ where: { providerId: userId, status: "ACTIVE" }, data: { status: "WITHDRAWN" } });
    await audit(tx, admin.id, status === "SUSPENDED" ? "provider.suspend" : "provider.reinstate", "User", userId, { reason });
    await notify(tx, userId, "APPLICATION", status === "SUSPENDED" ? "Provider account suspended" : "Provider account reinstated", reason || "Contact support for details.", "/dashboard");
  });
}

export const profileSchema = z.object({
  bio: z.string().trim().max(1500),
  qualifications: z.string().trim().max(1500),
  coachingStyle: z.string().trim().max(1000),
  availability: z.string().trim().max(500),
  currentRank: z.string().refine(isRank, "Choose a rank"),
  regions: z.array(z.enum(REGION_CODES as [string, ...string[]])).min(1, "Choose at least one region"),
  supportedServices: z.array(z.string()).min(1, "Choose at least one service"),
  coachingSpecialties: z.array(z.enum(COACHING_CODES as [string, ...string[]])),
  agents: z.array(z.enum(AGENTS as [string, ...string[]])).max(8),
  languages: z.array(z.string().trim().min(2).max(30)).max(6),
});

export async function updateProviderProfile(user: ActorRef, input: unknown) {
  if (user.role !== "PROVIDER") throw new UserError("Providers only", 403);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const profile = await db.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new UserError("Apply to become a provider first");
  const valid = await db.service.count({ where: { slug: { in: parsed.data.supportedServices } } });
  if (valid !== parsed.data.supportedServices.length) throw new UserError("Unknown service selected");
  // Changing the self-declared rank clears verification until an admin re-checks it.
  const rankVerified = profile.rankVerified && profile.currentRank === parsed.data.currentRank;
  await db.providerProfile.update({ where: { userId: user.id }, data: { ...parsed.data, rankVerified } });
}

export async function toggleFavorite(user: ActorRef, providerId: string) {
  const provider = await db.providerProfile.findUnique({ where: { userId: providerId } });
  if (!provider || provider.status !== "APPROVED") throw new UserError("Provider not found", 404);
  const existing = await db.favorite.findUnique({ where: { userId_providerId: { userId: user.id, providerId } } });
  if (existing) await db.favorite.delete({ where: { id: existing.id } });
  else await db.favorite.create({ data: { userId: user.id, providerId } });
  return !existing;
}
