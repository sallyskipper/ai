import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { providerStats } from "./domain/reviews";

export async function listApprovedProviders(opts: { service?: string; region?: string; page?: number; perPage?: number; ids?: string[] }) {
  const where: Prisma.ProviderProfileWhereInput = {
    status: "APPROVED",
    user: { status: "ACTIVE" },
    ...(opts.service ? { supportedServices: { has: opts.service } } : {}),
    ...(opts.region ? { regions: { has: opts.region } } : {}),
    ...(opts.ids ? { userId: { in: opts.ids } } : {}),
  };
  const perPage = opts.perPage ?? 24;
  const page = Math.max(1, opts.page ?? 1);
  const [total, profiles] = await Promise.all([
    db.providerProfile.count({ where }),
    db.providerProfile.findMany({
      where,
      include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
      orderBy: { approvedAt: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);
  const items = await Promise.all(
    profiles.map(async (p) => ({
      id: p.user.id,
      displayName: p.user.displayName,
      avatarColor: p.user.avatarColor,
      profile: p,
      stats: await providerStats(p.userId),
    })),
  );
  return { items, total, pages: Math.ceil(total / perPage), page };
}
