import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { listApprovedProviders } from "@/lib/providers-query";
import { ProviderCard } from "@/components/provider-card";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Favorite providers" };

export default async function FavoritesPage() {
  const viewer = await requireViewer();
  const favs = await db.favorite.findMany({ where: { userId: viewer.id }, select: { providerId: true } });
  const { items } = favs.length ? await listApprovedProviders({ ids: favs.map((f) => f.providerId), perPage: 100 }) : { items: [] };
  return (
    <>
      <PageHeader title="Favorite providers" subtitle="Providers you've saved. Favorite from any provider profile." />
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((p) => <ProviderCard key={p.id} p={p} />)}</div>
      ) : (
        <Card><EmptyState title="No favorites yet" body="Save providers you like to find them quickly later." action={<LinkButton href="/providers">Browse providers</LinkButton>} /></Card>
      )}
    </>
  );
}
