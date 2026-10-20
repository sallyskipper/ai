import Link from "next/link";
import { formatCents } from "@/lib/money";
import { Avatar, Badge, RankChip, Stars, VerifiedBadge, pct } from "./ui";

export type ProviderSummary = {
  id: string;
  displayName: string;
  avatarColor: string;
  profile: { currentRank: string | null; peakRank: string | null; rankVerified: boolean; regions: string[]; supportedServices: string[]; bio: string };
  stats: { avgRating: number | null; reviewCount: number; completedOrders: number; completionRate: number | null };
};

const SERVICE_SHORT: Record<string, string> = {
  "valorant-solo-rank-up": "Solo",
  "valorant-duo-rank-up": "Duo",
  "valorant-coaching": "Coaching",
};

export function ProviderCard({ p }: { p: ProviderSummary }) {
  return (
    <Link href={`/providers/${p.id}`} className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-red/40">
      <div className="flex items-start gap-3">
        <Avatar name={p.displayName} color={p.avatarColor} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold group-hover:text-red-hot">{p.displayName}</p>
            <VerifiedBadge />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <Stars value={p.stats.avgRating} size={12} />
            {p.stats.reviewCount > 0 ? (
              <span>
                {p.stats.avgRating!.toFixed(1)} · {p.stats.reviewCount} verified review{p.stats.reviewCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span>No reviews yet</span>
            )}
          </div>
        </div>
      </div>
      {p.profile.bio && <p className="mt-3 line-clamp-2 text-sm text-muted">{p.profile.bio}</p>}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
        <div>
          <p className="text-faint">Rank</p>
          <div className="mt-0.5"><RankChip rank={p.profile.currentRank} /></div>
        </div>
        <div>
          <p className="text-faint">Completed</p>
          <p className="mt-0.5 text-sm font-medium">{p.stats.completedOrders}</p>
        </div>
        <div>
          <p className="text-faint">Completion</p>
          <p className="mt-0.5 text-sm font-medium">{pct(p.stats.completionRate)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {p.profile.supportedServices.map((s) => (
          <Badge key={s}>{SERVICE_SHORT[s] ?? s}</Badge>
        ))}
        {p.profile.regions.map((r) => (
          <Badge key={r} tone="blue">{r}</Badge>
        ))}
      </div>
    </Link>
  );
}

export { formatCents };
