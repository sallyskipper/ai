import { requireViewer } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return <DashboardShell viewer={viewer}>{children}</DashboardShell>;
}
