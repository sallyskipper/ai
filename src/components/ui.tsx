import Link from "next/link";
import clsx from "clsx";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/domain/order-machine";
import { TIER_COLORS, tierOf } from "@/lib/valorant";

export { clsx };

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export function btnClass(variant: BtnVariant = "primary", size: "sm" | "md" | "lg" = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
    size === "sm" && "h-8 px-3 text-xs",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-base",
    variant === "primary" && "bg-red text-white shadow-[0_0_0_1px_rgba(255,48,56,0.4),0_8px_24px_-8px_rgba(229,9,20,0.6)] hover:bg-red-hot",
    variant === "secondary" && "bg-panel-2 text-text border border-line hover:border-line-strong hover:bg-[#2c2c33]",
    variant === "outline" && "border border-red/60 text-red-hot hover:bg-red/10",
    variant === "ghost" && "text-muted hover:text-text hover:bg-panel-2",
    variant === "danger" && "border border-red/40 bg-red/10 text-red-hot hover:bg-red/20",
  );
}

export function LinkButton({
  href,
  children,
  variant,
  size,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Link href={href} className={clsx(btnClass(variant, size), className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function CardHeader({ title, action, subtitle }: { title: React.ReactNode; action?: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "red" | "green" | "amber" | "blue" | "gray" | "purple";
const TONES: Record<Tone, string> = {
  red: "bg-red/15 text-red-hot ring-red/30",
  green: "bg-ok/10 text-ok ring-ok/25",
  amber: "bg-warn/10 text-warn ring-warn/25",
  blue: "bg-info/10 text-info ring-info/25",
  gray: "bg-white/5 text-muted ring-white/10",
  purple: "bg-purple-400/10 text-purple-300 ring-purple-400/25",
};

export function Badge({ children, tone = "gray", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<OrderStatus, Tone> = {
  DRAFT: "gray",
  OPEN_FOR_OFFERS: "blue",
  OFFERS_RECEIVED: "red",
  AWAITING_PAYMENT: "amber",
  ASSIGNED: "purple",
  IN_PROGRESS: "purple",
  COMPLETION_SUBMITTED: "amber",
  AWAITING_CUSTOMER_CONFIRMATION: "amber",
  COMPLETED: "green",
  CANCELLATION_REQUESTED: "amber",
  CANCELLED: "gray",
  DISPUTED: "red",
  REFUNDED: "gray",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const KIND_META: Record<string, { label: string; short: string; tone: Tone }> = {
  SOLO_RANK_UP: { label: "Solo Rank Up", short: "SOLO", tone: "amber" },
  DUO_RANK_UP: { label: "Duo Rank Up", short: "DUO", tone: "blue" },
  COACHING: { label: "Coaching", short: "COACH", tone: "green" },
};
export function ServiceBadge({ kind }: { kind: string }) {
  const m = KIND_META[kind] ?? { label: kind, short: kind, tone: "gray" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
export const kindLabel = (kind: string) => KIND_META[kind]?.label ?? kind;

export function RankChip({ rank }: { rank?: string | null }) {
  if (!rank) return <span className="text-faint">—</span>;
  let color = "#A1A1AA";
  try {
    color = TIER_COLORS[tierOf(rank)];
  } catch {}
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span className="inline-block size-2.5 rotate-45 rounded-[2px]" style={{ background: color }} />
      {rank}
    </span>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-ink"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color ?? "#E50914"}, #1c1c21)`, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span title="Personally vetted by Redline" className="inline-flex items-center gap-1 rounded bg-red/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-red-hot uppercase ring-1 ring-red/30">
      <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
        <path d="M8 0l2 2.2 3-.4.5 3L16 6.5 14.6 9l.4 3-3 .5L10.5 15 8 13.6 5.5 15 4 12.5l-3-.5.4-3L0 6.5l2.5-1.7.5-3 3 .4L8 0zm-1.2 10.6l5-5-1-1-4 4-1.9-1.9-1 1 2.9 2.9z" />
      </svg>
      Vetted
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number | null | undefined; size?: number }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value ? `${value.toFixed(1)} out of 5` : "No ratings yet"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" width={size} height={size} fill={i <= Math.round(v) ? "#FF3038" : "#3a3a43"} aria-hidden>
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div className={clsx("card group relative h-full overflow-hidden p-4 transition-colors", href && "hover:border-line-strong")}>
      {accent && <span className="absolute inset-y-0 left-0 w-0.5 bg-red" />}
      <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-2 flex size-12 items-center justify-center rounded-full border border-line bg-coal">
        <span className="block size-3 rotate-45 border-2 border-red" />
      </div>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-info/25 bg-info/5 text-info",
        tone === "warn" && "border-warn/30 bg-warn/5 text-warn",
        tone === "danger" && "border-red/40 bg-red/10 text-red-hot",
        tone === "ok" && "border-ok/30 bg-ok/5 text-ok",
      )}
    >
      {children}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; count?: number; key: string }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
            active === t.key ? "border-red text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={clsx("rounded px-1.5 text-[11px] font-bold", active === t.key ? "bg-red text-white" : "bg-panel-2 text-muted")}>{t.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? <LinkButton href={hrefFor(page - 1)} variant="secondary" size="sm">Previous</LinkButton> : null}
        {page < pages ? <LinkButton href={hrefFor(page + 1)} variant="secondary" size="sm">Next</LinkButton> : null}
      </div>
    </div>
  );
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-faint">{k}</dt>
          <dd className="mt-0.5 break-words text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx("group inline-flex items-center gap-2", className)} aria-label="Redline home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <path d="M4 28L16 4l12 24H20l-4-8-4 8H4z" fill="#E50914" />
        <path d="M13.5 22L16 17l2.5 5h-5z" fill="#0B0B0D" />
      </svg>
      <span className="font-display text-lg font-bold tracking-[0.18em]">
        RED<span className="text-red">LINE</span>
      </span>
    </Link>
  );
}

export function timeAgo(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}
