import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { setProviderStatusAction, setRankVerifiedAction, setUserStatusAction } from "@/actions/admin";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, EmptyState, PageHeader, Pagination, RankChip, btnClass, fmtDate } from "@/components/ui";

export const metadata = { title: "Users" };
const PER_PAGE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.UserWhereInput = {
    ...(sp.role && ["CUSTOMER", "PROVIDER", "ADMIN"].includes(sp.role) ? { role: sp.role as Role } : {}),
    ...(sp.status === "SUSPENDED" ? { status: "SUSPENDED" } : {}),
    ...(sp.q ? { OR: [{ email: { contains: sp.q, mode: "insensitive" } }, { displayName: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { providerProfile: true, _count: { select: { ordersAsCustomer: true, ordersAsProvider: true } } },
    }),
    db.user.count({ where }),
  ]);
  const qs = (p: number) => `/admin/users?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.role ? { role: sp.role } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Users" subtitle={`${total} matching accounts`} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-60 flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} placeholder="Email or display name" className="input" /></div>
          <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" defaultValue={sp.role ?? ""} className="input"><option value="">All</option><option>CUSTOMER</option><option>PROVIDER</option><option>ADMIN</option></select></div>
          <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">All</option><option value="SUSPENDED">Suspended</option></select></div>
          <button className={btnClass("secondary")}>Search</button>
        </form>
      </Card>
      <Card>
        {users.length === 0 ? <EmptyState title="No users found" /> : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[1000px]">
              <thead><tr><th>User</th><th>Role</th><th>Provider</th><th>Rank</th><th className="text-right">Orders</th><th>Joined</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.displayName} color={u.avatarColor} size={28} />
                        <div>
                          <p className="font-medium">{u.displayName} {u.status === "SUSPENDED" && <Badge tone="red">suspended</Badge>}</p>
                          <p className="text-xs text-faint">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={u.role === "ADMIN" ? "red" : u.role === "PROVIDER" ? "purple" : "gray"}>{u.role.toLowerCase()}</Badge></td>
                    <td>{u.providerProfile ? <Badge tone={u.providerProfile.status === "APPROVED" ? "green" : u.providerProfile.status === "SUSPENDED" ? "red" : "amber"}>{u.providerProfile.status.toLowerCase()}</Badge> : "—"}</td>
                    <td>{u.providerProfile ? <span className="flex items-center gap-1.5"><RankChip rank={u.providerProfile.currentRank} />{u.providerProfile.rankVerified && <Badge tone="green">✓</Badge>}</span> : "—"}</td>
                    <td className="text-right tabular-nums">{u._count.ordersAsCustomer + u._count.ordersAsProvider}</td>
                    <td className="text-xs text-muted">{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {u.providerProfile?.status === "APPROVED" && (
                          <>
                            <Link href={`/providers/${u.id}`} className={btnClass("ghost", "sm")}>Profile</Link>
                            <ActionForm action={setRankVerifiedAction}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="verified" value={String(!u.providerProfile.rankVerified)} />
                              <SubmitButton variant="ghost" size="sm">{u.providerProfile.rankVerified ? "Unverify rank" : "Verify rank"}</SubmitButton>
                            </ActionForm>
                            <ConfirmAction action={setProviderStatusAction} hidden={{ userId: u.id, status: "SUSPENDED" }} size="sm" label="Suspend provider" title={`Suspend ${u.displayName} as provider?`} body={<p>Their active offers are withdrawn and they can&apos;t bid until reinstated. Assigned orders continue and can be handled via disputes.</p>} reason reasonRequired confirmLabel="Suspend" />
                          </>
                        )}
                        {u.providerProfile?.status === "SUSPENDED" && (
                          <ConfirmAction action={setProviderStatusAction} hidden={{ userId: u.id, status: "APPROVED" }} variant="secondary" size="sm" label="Reinstate" title="Reinstate provider?" reason confirmLabel="Reinstate" />
                        )}
                        {u.role !== "ADMIN" && (
                          u.status === "ACTIVE" ? (
                            <ConfirmAction action={setUserStatusAction} hidden={{ userId: u.id, status: "SUSPENDED" }} size="sm" label="Suspend account" title={`Suspend ${u.displayName}?`} body={<p>They are signed out immediately and can&apos;t sign in.</p>} reason reasonRequired confirmLabel="Suspend account" />
                          ) : (
                            <ConfirmAction action={setUserStatusAction} hidden={{ userId: u.id, status: "ACTIVE" }} variant="secondary" size="sm" label="Reactivate" title="Reactivate account?" reason confirmLabel="Reactivate" />
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={qs} />
      </Card>
    </>
  );
}
