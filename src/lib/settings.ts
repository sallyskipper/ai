import type { Tx } from "./db";

// Platform-wide settings editable by administrators.
export const SETTING_DEFAULTS = {
  commissionBps: "1500", // 15% platform commission on agreed price
  payoutHoldHours: "0", // extra hold after confirmation before funds become available
  minPayoutCents: "2000",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(tx: Tx, key: SettingKey): Promise<string> {
  const row = await tx.platformSetting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getIntSetting(tx: Tx, key: SettingKey): Promise<number> {
  const n = parseInt(await getSetting(tx, key), 10);
  return Number.isFinite(n) ? n : parseInt(SETTING_DEFAULTS[key], 10);
}
