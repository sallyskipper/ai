import { requireRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole("ADMIN");
  return <DashboardShell viewer={viewer}>{children}</DashboardShell>;
}
