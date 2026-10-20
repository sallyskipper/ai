import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { isBookable } from "@/lib/catalog";
import { OrderForm } from "@/components/order-form";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Create order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const viewer = await requireViewer();
  if (viewer.role !== "CUSTOMER")
    return (
      <Card>
        <EmptyState title="Orders are placed from customer accounts" body="Provider and admin accounts can't create orders. Sign in with a customer account to order." action={<LinkButton href="/dashboard" variant="secondary">Back to dashboard</LinkButton>} />
      </Card>
    );
  const [services, user] = await Promise.all([
    db.service.findMany({ where: { game: { slug: "valorant" } }, orderBy: { sortOrder: "asc" } }),
    db.user.findUnique({ where: { id: viewer.id }, select: { region: true } }),
  ]);
  const { service } = await searchParams;
  return (
    <>
      <PageHeader title="Create order" subtitle="Describe what you need. Approved providers will send offers at or above the minimum price." />
      <OrderForm
        initialSlug={service}
        defaultRegion={user?.region ?? "NA"}
        services={services.map((s) => ({ slug: s.slug, kind: s.kind, name: s.name, tagline: s.tagline, rules: s.rules, bookable: isBookable(s), floorPriceCents: s.floorPriceCents }))}
      />
    </>
  );
}
