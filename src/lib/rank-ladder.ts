// Default minimum price (in cents) for ONE division, by rank tier. Every division
// in a tier costs the same, and prices stack as you climb: Ascendant 1 → Immortal 1
// is 3 Ascendant divisions = 3 × $25 = $75. Stored as one rule per division step
// (keyed by the starting rank) so admins can still adjust any single step.
export const TIER_DIVISION_CENTS: Record<string, number> = {
  Iron: 600,
  Bronze: 800,
  Silver: 1000,
  Gold: 1300,
  Platinum: 1600,
  Diamond: 2000,
  Ascendant: 2500,
  Immortal: 7000,
};

/** Per-division minimums keyed by the rank each step starts from, e.g. "Ascendant 2" → 2500. */
export const RANK_LADDER_CENTS: Record<string, number> = Object.fromEntries(
  Object.entries(TIER_DIVISION_CENTS).flatMap(([tier, cents]) => [1, 2, 3].map((d) => [`${tier} ${d}`, cents])),
);

// Smallest rank-up order: one Iron division.
export const RANK_UP_FLOOR_CENTS = 600;
