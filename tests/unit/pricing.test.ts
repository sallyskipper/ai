import { describe, expect, it } from "vitest";
import { computeMinPrice, findRule, splitCommission, type Rule } from "@/lib/domain/pricing";

const rules: Rule[] = [
  { id: "g", unit: "DIVISION", tier: "Gold", variant: null, amountCents: 1000 },
  { id: "p", unit: "DIVISION", tier: "Platinum", variant: null, amountCents: 1400 },
  { id: "game", unit: "GAME", tier: "Gold", variant: null, amountCents: 500 },
  { id: "h", unit: "HOUR", tier: null, variant: null, amountCents: 2500 },
  { id: "hv", unit: "HOUR", tier: null, variant: "VOD_REVIEW", amountCents: 2000 },
];

describe("computeMinPrice", () => {
  it("sums division steps by the tier each step starts in", () => {
    const r = computeMinPrice("SOLO_RANK_UP", { currentRank: "Gold 2", desiredRank: "Platinum 2", queue: "Competitive", preferences: [], timeframeDays: 7 }, rules, 0);
    // Gold 2→Gold 3→Plat 1 (2 Gold steps), Plat 1→Plat 2 (1 Plat step)
    expect(r.computedCents).toBe(2 * 1000 + 1400);
    expect(r.lines.map((l) => l.quantity)).toEqual([2, 1]);
  });

  it("applies the service floor when the computed price is lower", () => {
    const r = computeMinPrice("SOLO_RANK_UP", { currentRank: "Gold 1", desiredRank: "Gold 2", queue: "Competitive", preferences: [], timeframeDays: 7 }, rules, 1500);
    expect(r.computedCents).toBe(1000);
    expect(r.minPriceCents).toBe(1500);
  });

  it("prices duo games per game at the current tier", () => {
    const r = computeMinPrice("DUO_RANK_UP", { currentRank: "Gold 3", mode: "GAMES", games: 6, server: "Virginia", schedule: "Evenings", communication: ["Discord voice"] }, rules, 0);
    expect(r.minPriceCents).toBe(3000);
  });

  it("prefers variant-specific coaching rates and scales by hours", () => {
    const r = computeMinPrice("COACHING", { coachingType: "VOD_REVIEW", currentRank: "Gold 1", sessionMinutes: 90, sessions: 2, goals: "x" }, rules, 0);
    expect(r.minPriceCents).toBe(3 * 2000);
    const g = computeMinPrice("COACHING", { coachingType: "MAP_STRATEGY", currentRank: "Gold 1", sessionMinutes: 60, sessions: 1, goals: "x" }, rules, 0);
    expect(g.minPriceCents).toBe(2500);
  });

  it("refuses to price tiers without a configured rule", () => {
    expect(() =>
      computeMinPrice("SOLO_RANK_UP", { currentRank: "Diamond 1", desiredRank: "Diamond 2", queue: "Competitive", preferences: [], timeframeDays: 7 }, rules, 0),
    ).toThrow(/No price configured/);
  });
});

describe("findRule", () => {
  it("picks the most specific rule", () => {
    const rs: Rule[] = [
      { id: "a", unit: "HOUR", tier: null, variant: null, amountCents: 1 },
      { id: "b", unit: "HOUR", tier: "Gold", variant: null, amountCents: 2 },
      { id: "c", unit: "HOUR", tier: "Gold", variant: "VOD_REVIEW", amountCents: 3 },
    ];
    expect(findRule(rs, "HOUR", "Gold", "VOD_REVIEW")?.id).toBe("c");
    expect(findRule(rs, "HOUR", "Gold", "OTHER")?.id).toBe("b");
    expect(findRule(rs, "HOUR", "Iron", null)?.id).toBe("a");
  });
});

describe("splitCommission", () => {
  it("splits agreed price into fee and provider net", () => {
    expect(splitCommission(10000, 1500)).toEqual({ platformFeeCents: 1500, providerNetCents: 8500 });
    const s = splitCommission(3333, 1500);
    expect(s.platformFeeCents + s.providerNetCents).toBe(3333);
  });
});

describe("commission tiers", async () => {
  const { tierKeyFor } = await import("@/lib/settings");
  it("charges a smaller cut on bigger orders", () => {
    expect(tierKeyFor(4999)).toBe("commissionSmallBps");
    expect(tierKeyFor(5000)).toBe("commissionMediumBps");
    expect(tierKeyFor(14999)).toBe("commissionMediumBps");
    expect(tierKeyFor(15000)).toBe("commissionLargeBps");
  });
});

describe("per-division ladder", () => {
  const ladder: Rule[] = [
    { id: "tier-asc", unit: "DIVISION", tier: "Ascendant", variant: null, amountCents: 9999 },
    { id: "a1", unit: "DIVISION", tier: "Ascendant 1", variant: null, amountCents: 2500 },
    { id: "a2", unit: "DIVISION", tier: "Ascendant 2", variant: null, amountCents: 2750 },
    { id: "a3", unit: "DIVISION", tier: "Ascendant 3", variant: null, amountCents: 4000 },
    { id: "i1", unit: "DIVISION", tier: "Immortal 1", variant: null, amountCents: 7000 },
  ];
  const solo = (from: string, to: string) =>
    computeMinPrice("SOLO_RANK_UP", { currentRank: from, desiredRank: to, queue: "Competitive", preferences: [], timeframeDays: 7 }, ladder, 600);

  it("prices each division step by its own rule, overriding the tier rule", () => {
    expect(solo("Ascendant 1", "Ascendant 2").minPriceCents).toBe(2500);
    expect(solo("Immortal 1", "Immortal 2").minPriceCents).toBe(7000);
    const r = solo("Ascendant 1", "Immortal 2");
    expect(r.minPriceCents).toBe(2500 + 2750 + 4000 + 7000);
    expect(r.lines.map((l) => l.label)).toEqual([
      "Ascendant 1 → Ascendant 2",
      "Ascendant 2 → Ascendant 3",
      "Ascendant 3 → Immortal 1",
      "Immortal 1 → Immortal 2",
    ]);
  });

  it("falls back to the tier rule when a division has no rule of its own", () => {
    const partial = ladder.filter((r) => r.id !== "a2");
    expect(computeMinPrice("SOLO_RANK_UP", { currentRank: "Ascendant 2", desiredRank: "Ascendant 3", queue: "Competitive", preferences: [], timeframeDays: 7 }, partial, 0).minPriceCents).toBe(9999);
  });
});

describe("default rank ladder", async () => {
  const { RANK_LADDER_CENTS } = await import("@/lib/rank-ladder");
  const rules: Rule[] = Object.entries(RANK_LADDER_CENTS).map(([rank, c]) => ({ id: rank, unit: "DIVISION", tier: rank, variant: null, amountCents: c }));
  const price = (from: string, to: string) =>
    computeMinPrice("SOLO_RANK_UP", { currentRank: from, desiredRank: to, queue: "Competitive", preferences: [], timeframeDays: 7 }, rules, 600).minPriceCents;

  it("charges the same per division within a tier and stacks across divisions", () => {
    expect(price("Iron 1", "Iron 2")).toBe(600);
    expect(price("Iron 1", "Bronze 1")).toBe(1800); // 3 × $6
    expect(price("Ascendant 1", "Ascendant 2")).toBe(2500);
    expect(price("Ascendant 1", "Immortal 1")).toBe(7500); // 3 × $25
    expect(price("Immortal 1", "Immortal 2")).toBe(7000);
    expect(price("Ascendant 3", "Immortal 2")).toBe(2500 + 7000);
  });
});
