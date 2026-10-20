import { db } from "./db";
import { computeMinPrice } from "./domain/pricing";

export async function getCatalog() {
  return db.game.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { services: { orderBy: { sortOrder: "asc" }, include: { pricingRules: { where: { active: true } } } } },
  });
}

export function isBookable(s: { enabled: boolean; accountOperated: boolean; complianceReviewedAt: Date | null }) {
  return s.enabled && (!s.accountOperated || !!s.complianceReviewedAt);
}

type SvcWithRules = Awaited<ReturnType<typeof getCatalog>>[number]["services"][number];

/** Example minimums computed from the live pricing rules (never hard-coded). */
export function exampleMinimums(s: SvcWithRules): { label: string; cents: number | null }[] {
  const tryPrice = (label: string, details: never) => {
    try {
      return { label, cents: computeMinPrice(s.kind, details, s.pricingRules, s.floorPriceCents).minPriceCents };
    } catch {
      return { label, cents: null };
    }
  };
  if (s.kind === "COACHING")
    return [
      tryPrice("1 h live session", { coachingType: "LIVE_1ON1", currentRank: "Gold 1", sessionMinutes: 60, sessions: 1, goals: "-" } as never),
      tryPrice("1 h VOD review", { coachingType: "VOD_REVIEW", currentRank: "Gold 1", sessionMinutes: 60, sessions: 1, goals: "-" } as never),
      tryPrice("4 × 90 min plan", { coachingType: "IMPROVEMENT_PLAN", currentRank: "Gold 1", sessionMinutes: 90, sessions: 4, goals: "-" } as never),
    ];
  const key = s.kind === "SOLO_RANK_UP" ? "desiredRank" : "targetRank";
  const base = s.kind === "SOLO_RANK_UP" ? { queue: "Competitive", preferences: [], timeframeDays: 7 } : { mode: "TARGET_RANK", server: "-", schedule: "-", communication: ["Discord voice"] };
  return [
    tryPrice("Silver 3 → Gold 1", { ...base, currentRank: "Silver 3", [key]: "Gold 1" } as never),
    tryPrice("Gold 1 → Platinum 1", { ...base, currentRank: "Gold 1", [key]: "Platinum 1" } as never),
    tryPrice("Diamond 1 → Ascendant 1", { ...base, currentRank: "Diamond 1", [key]: "Ascendant 1" } as never),
  ];
}
