export function formatCents(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Parses a user-entered dollar amount ("12", "12.5", "$12.50") into cents. */
export function parseDollars(input: unknown): number | undefined {
  if (typeof input !== "string" || input.trim() === "") return undefined;
  const n = Number(input.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}
