// Static Valorant reference data. Ranks are ordered from lowest to highest.

export const TIERS = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Ascendant",
  "Immortal",
  "Radiant",
] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_COLORS: Record<Tier, string> = {
  Iron: "#6B6B70",
  Bronze: "#A2703D",
  Silver: "#B7BEC4",
  Gold: "#E8B64B",
  Platinum: "#3FB5C4",
  Diamond: "#B38CF0",
  Ascendant: "#2FBF71",
  Immortal: "#E0445A",
  Radiant: "#F5E6A8",
};

/** Every rank step a player can hold, e.g. "Gold 2", "Radiant". */
export const RANKS: string[] = TIERS.flatMap((t) =>
  t === "Radiant" ? ["Radiant"] : [1, 2, 3].map((d) => `${t} ${d}`),
);

export function rankIndex(rank: string): number {
  return RANKS.indexOf(rank);
}

export function isRank(rank: unknown): rank is string {
  return typeof rank === "string" && RANKS.includes(rank);
}

export function tierOf(rank: string): Tier {
  const t = rank.split(" ")[0] as Tier;
  if (!TIERS.includes(t)) throw new Error(`Unknown rank ${rank}`);
  return t;
}

export const REGIONS = [
  { code: "NA", name: "North America" },
  { code: "EU", name: "Europe" },
  { code: "LATAM", name: "Latin America" },
  { code: "BR", name: "Brazil" },
  { code: "AP", name: "Asia Pacific" },
  { code: "KR", name: "Korea" },
] as const;
export const REGION_CODES = REGIONS.map((r) => r.code) as string[];

export const AGENTS = [
  "Astra", "Breach", "Brimstone", "Chamber", "Clove", "Cypher", "Deadlock", "Fade",
  "Gekko", "Harbor", "Iso", "Jett", "KAY/O", "Killjoy", "Neon", "Omen", "Phoenix",
  "Raze", "Reyna", "Sage", "Skye", "Sova", "Tejo", "Viper", "Vyse", "Waylay", "Yoru",
];

export const MAPS = [
  "Abyss", "Ascent", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox",
  "Lotus", "Pearl", "Split", "Sunset",
];

export const COACHING_TYPES = [
  { code: "LIVE_1ON1", name: "Live one-on-one coaching" },
  { code: "VOD_REVIEW", name: "VOD review" },
  { code: "AIM_MECHANICS", name: "Aim & mechanics" },
  { code: "GAME_SENSE", name: "Game sense & decision-making" },
  { code: "AGENT_SPECIFIC", name: "Agent-specific coaching" },
  { code: "MAP_STRATEGY", name: "Map strategy" },
  { code: "IMPROVEMENT_PLAN", name: "Personalized improvement plan" },
] as const;
export const COACHING_CODES = COACHING_TYPES.map((c) => c.code) as string[];
export function coachingName(code: string) {
  return COACHING_TYPES.find((c) => c.code === code)?.name ?? code;
}

export const COMM_OPTIONS = ["In-game voice", "Discord voice", "Text chat only"];
