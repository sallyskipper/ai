// Seeds catalog, pricing and settings. Demo accounts are created only outside
// production and are clearly named as demo accounts; no reviews or ratings are seeded.
import { PrismaClient, type PricingUnit } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DUO_MULTIPLIER, RANK_LADDER_CENTS, RANK_UP_FLOOR_CENTS } from "../src/lib/rank-ladder";

const db = new PrismaClient();

const DUO_GAME: Record<string, number> = {
  Iron: 300, Bronze: 350, Silver: 400, Gold: 500, Platinum: 650, Diamond: 900, Ascendant: 1200, Immortal: 1800, Radiant: 2500,
};

async function main() {
  const game = await db.game.upsert({
    where: { slug: "valorant" },
    create: { slug: "valorant", name: "Valorant", sortOrder: 0 },
    update: {},
  });

  const services = [
    {
      slug: "valorant-solo-rank-up",
      kind: "SOLO_RANK_UP" as const,
      name: "Solo Rank Up",
      tagline: "Solo rank up with an approved provider.",
      description:
        "Solo rank up. Set your current and desired rank, region, queue and timeframe, then choose from offers at or above the minimum price.",
      rules: "Solo service. Never share your password through Redline or any third party.",
      accountOperated: true,
      enabled: false,
      floorPriceCents: RANK_UP_FLOOR_CENTS,
      sortOrder: 0,
    },
    {
      slug: "valorant-duo-rank-up",
      kind: "DUO_RANK_UP" as const,
      name: "Duo Rank Up",
      tagline: "Queue together with a high-rank provider on your own account.",
      description:
        "Play alongside an approved provider in your party. You play every game on your own account; the provider joins as your duo partner and shares calls and comms.",
      rules:
        "You play on your own account at all times. Providers never request or receive account credentials. Party rank restrictions set by the game apply.",
      accountOperated: false,
      enabled: true,
      floorPriceCents: RANK_UP_FLOOR_CENTS * DUO_MULTIPLIER,
      sortOrder: 1,
    },
    {
      slug: "valorant-coaching",
      kind: "COACHING" as const,
      name: "Coaching",
      tagline: "Live sessions, VOD reviews and personal improvement plans.",
      description:
        "Hire an experienced coach for live one-on-one sessions, VOD review, aim and mechanics, game sense, agent-specific play, map strategy, or a personalized improvement plan.",
      rules: "Sessions are scheduled with your coach through the order workspace. Unused sessions can be cancelled per the cancellation policy.",
      accountOperated: false,
      enabled: true,
      floorPriceCents: 1500,
      sortOrder: 2,
    },
  ];

  for (const s of services) {
    const svc = await db.service.upsert({
      where: { slug: s.slug },
      create: { ...s, gameId: game.id },
      update: {},
    });
    const existing = await db.pricingRule.count({ where: { serviceId: svc.id } });
    if (existing) continue;
    const rules: { unit: PricingUnit; tier: string | null; variant: string | null; amountCents: number }[] = [];
    // Rank-up services get one rule per division step (the per-rank ladder).
    if (s.kind === "SOLO_RANK_UP" || s.kind === "DUO_RANK_UP")
      for (const [rank, c] of Object.entries(RANK_LADDER_CENTS))
        rules.push({ unit: "DIVISION", tier: rank, variant: null, amountCents: s.kind === "DUO_RANK_UP" ? c * DUO_MULTIPLIER : c });
    if (s.kind === "DUO_RANK_UP") {
      for (const [tier, c] of Object.entries(DUO_GAME)) rules.push({ unit: "GAME", tier, variant: null, amountCents: c });
    }
    if (s.kind === "COACHING") {
      rules.push({ unit: "HOUR", tier: null, variant: null, amountCents: 2500 });
      rules.push({ unit: "HOUR", tier: null, variant: "VOD_REVIEW", amountCents: 2000 });
      rules.push({ unit: "HOUR", tier: null, variant: "IMPROVEMENT_PLAN", amountCents: 3000 });
    }
    await db.pricingRule.createMany({ data: rules.map((r) => ({ ...r, serviceId: svc.id })) });
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@redline.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? undefined : "ChangeMe!123");
  if (!adminPassword) throw new Error("Set ADMIN_PASSWORD to seed the admin account in production");
  await db.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), displayName: "Redline Admin", role: "ADMIN", avatarColor: "#E50914" },
    update: {},
  });

  // Demo accounts: always in development; in production only when SEED_DEMO=true (test deployments).
  const seedDemo = process.env.SEED_DEMO === "true" || (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "false");
  if (seedDemo) {
    const pw = await bcrypt.hash("Password123!", 12);
    await db.user.upsert({
      where: { email: "customer@redline.local" },
      create: { email: "customer@redline.local", passwordHash: pw, displayName: "Demo Customer", role: "CUSTOMER", avatarColor: "#3FB5C4", region: "NA" },
      update: {},
    });
    const provider = await db.user.upsert({
      where: { email: "provider@redline.local" },
      create: { email: "provider@redline.local", passwordHash: pw, displayName: "Demo Provider", role: "PROVIDER", avatarColor: "#B38CF0", region: "NA" },
      update: {},
    });
    await db.providerProfile.upsert({
      where: { userId: provider.id },
      create: {
        userId: provider.id,
        status: "APPROVED",
        approvedAt: new Date(),
        bio: "Demo provider account for local development. Not a real provider.",
        qualifications: "Demo account",
        currentRank: "Immortal 2",
        peakRank: "Radiant",
        regions: ["NA"],
        supportedServices: ["valorant-duo-rank-up", "valorant-coaching"],
        coachingSpecialties: ["VOD_REVIEW", "AIM_MECHANICS"],
        agents: ["Jett", "Omen"],
        languages: ["English"],
        availability: "Weekday evenings (EST)",
      },
      update: {},
    });
  }
  console.log("Seed complete");
}

main().finally(() => db.$disconnect());
