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
