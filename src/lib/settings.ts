import type { Tx } from "./db";

// Platform-wide settings editable by administrators.
export const SETTING_DEFAULTS = {
  // Sliding commission on the agreed price: bigger orders pay a smaller cut.
  commissionSmallBps: "1000", // 10% on orders under $50
  commissionMediumBps: "800", // 8% on orders from $50 to $149.99
  commissionLargeBps: "500", // 5% on orders of $150 or more
  payoutHoldHours: "0", // extra hold after confirmation before funds become available
  minPayoutCents: "2000",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(tx: Tx, key: SettingKey): Promise<string> {
  const row = await tx.platformSetting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

// The platform's cut of each order is limited to 5–10% of the agreed price.
export const COMMISSION_MIN_BPS = 500;
export const COMMISSION_MAX_BPS = 1000;

export const COMMISSION_TIERS = [
  { key: "commissionSmallBps", label: "Under $50", minCents: 0 },
  { key: "commissionMediumBps", label: "$50 – $149.99", minCents: 5000 },
  { key: "commissionLargeBps", label: "$150 and up", minCents: 15000 },
] as const;

export function tierKeyFor(agreedCents: number): (typeof COMMISSION_TIERS)[number]["key"] {
  return [...COMMISSION_TIERS].reverse().find((t) => agreedCents >= t.minCents)!.key;
}

const clampBps = (bps: number) => Math.min(COMMISSION_MAX_BPS, Math.max(COMMISSION_MIN_BPS, bps));

/** Commission for an order of this size, clamped to 5–10% even if a stored value is outside it. */
export async function getCommissionBps(tx: Tx, agreedCents: number): Promise<number> {
  return clampBps(await getIntSetting(tx, tierKeyFor(agreedCents)));
}

/** The current rate for every tier, for display. */
export async function getCommissionTiers(tx: Tx) {
  return Promise.all(COMMISSION_TIERS.map(async (t) => ({ ...t, bps: clampBps(await getIntSetting(tx, t.key)) })));
}

export async function getIntSetting(tx: Tx, key: SettingKey): Promise<number> {
  const n = parseInt(await getSetting(tx, key), 10);
  return Number.isFinite(n) ? n : parseInt(SETTING_DEFAULTS[key], 10);
}
