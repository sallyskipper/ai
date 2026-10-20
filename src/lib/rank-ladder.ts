// Default minimum price (in cents) for one division step, keyed by the rank the
// step starts from. "Ascendant 1": 2500 means Ascendant 1 → Ascendant 2 costs at
// least $25. Used to seed Solo and Duo Rank Up; admins can edit each step.
export const RANK_LADDER_CENTS: Record<string, number> = {
  "Iron 1": 600, "Iron 2": 650, "Iron 3": 700,
  "Bronze 1": 800, "Bronze 2": 850, "Bronze 3": 900,
  "Silver 1": 1000, "Silver 2": 1100, "Silver 3": 1200,
  "Gold 1": 1300, "Gold 2": 1400, "Gold 3": 1500,
  "Platinum 1": 1600, "Platinum 2": 1750, "Platinum 3": 1900,
  "Diamond 1": 2000, "Diamond 2": 2150, "Diamond 3": 2300,
  "Ascendant 1": 2500, "Ascendant 2": 2750, "Ascendant 3": 4000,
  "Immortal 1": 7000, "Immortal 2": 8500, "Immortal 3": 15000,
};

// Smallest rank-up order: one Iron division.
export const RANK_UP_FLOOR_CENTS = 600;
