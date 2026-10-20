import { RANKS, rankIndex, tierOf } from "@/lib/valorant";
import type { CoachingDetails, DuoDetails, SoloDetails } from "./order-details";

// Minimum-price engine. Pure: takes the service's active rules and an order's
// validated details and returns the minimum accepted price plus a breakdown that
// is snapshotted onto the order.

export type Rule = {
  id: string;
  unit: "DIVISION" | "GAME" | "HOUR";
  tier: string | null;
  variant: string | null;
  amountCents: number;
};

export type PriceLine = { label: string; quantity: number; unitCents: number; ruleId: string };

export type MinPriceResult = {
  minPriceCents: number;
  floorCents: number;
  computedCents: number;
  lines: PriceLine[];
};

export class PricingError extends Error {}

/** Most specific active rule wins: tier+variant > tier > variant > generic. */
export function findRule(rules: Rule[], unit: Rule["unit"], tier: string | null, variant: string | null): Rule | undefined {
  const candidates = rules.filter(
    (r) =>
      r.unit === unit &&
      (r.tier === null || r.tier === tier) &&
      (r.variant === null || r.variant === variant),
  );
  const score = (r: Rule) => (r.tier !== null ? 2 : 0) + (r.variant !== null ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

function divisionLines(rules: Rule[], from: string, to: string): PriceLine[] {
  const start = rankIndex(from);
  const end = rankIndex(to);
  if (start < 0 || end < 0 || end <= start) throw new PricingError("Invalid rank progression");
  // Each step is priced by the rank it starts from: a rule for that exact
  // division (e.g. "Ascendant 1") wins over a rule for the whole tier.
  // Consecutive steps priced by the same rule are grouped into one line.
  const lines: PriceLine[] = [];
  for (let i = start; i < end; i++) {
    const rank = RANKS[i];
    const tier = tierOf(rank);
    const exact = rules.find((r) => r.unit === "DIVISION" && r.tier === rank && r.variant === null);
    const rule = exact ?? findRule(rules, "DIVISION", tier, null);
    if (!rule) throw new PricingError(`No price configured for ${rank}`);
    const last = lines.at(-1);
    if (last && last.ruleId === rule.id) last.quantity += 1;
    else lines.push({ label: exact ? `${rank} → ${RANKS[i + 1]}` : `${tier} divisions`, quantity: 1, unitCents: rule.amountCents, ruleId: rule.id });
  }
  return lines;
}

export function computeMinPrice(
  kind: "SOLO_RANK_UP" | "DUO_RANK_UP" | "COACHING",
  details: SoloDetails | DuoDetails | CoachingDetails,
  rules: Rule[],
  floorCents: number,
): MinPriceResult {
  let lines: PriceLine[];
  if (kind === "SOLO_RANK_UP") {
    const d = details as SoloDetails;
    lines = divisionLines(rules, d.currentRank, d.desiredRank);
  } else if (kind === "DUO_RANK_UP") {
    const d = details as DuoDetails;
    if (d.mode === "TARGET_RANK") {
      lines = divisionLines(rules, d.currentRank, d.targetRank!);
    } else {
      const tier = tierOf(d.currentRank);
      const rule = findRule(rules, "GAME", tier, null);
      if (!rule) throw new PricingError(`No per-game price configured for ${tier}`);
      lines = [{ label: `${tier} duo games`, quantity: d.games!, unitCents: rule.amountCents, ruleId: rule.id }];
    }
  } else {
    const d = details as CoachingDetails;
    const tier = tierOf(d.currentRank);
    const rule = findRule(rules, "HOUR", tier, d.coachingType);
    if (!rule) throw new PricingError("No hourly coaching price configured");
    const hours = (d.sessionMinutes / 60) * d.sessions;
    lines = [{ label: "Coaching hours", quantity: hours, unitCents: rule.amountCents, ruleId: rule.id }];
  }
  const computedCents = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitCents, 0));
  return { minPriceCents: Math.max(computedCents, floorCents), floorCents, computedCents, lines };
}

/** Platform commission on an agreed price, in basis points. Provider gets the rest. */
export function splitCommission(agreedCents: number, commissionBps: number) {
  const platformFeeCents = Math.round((agreedCents * commissionBps) / 10_000);
  return { platformFeeCents, providerNetCents: agreedCents - platformFeeCents };
}
