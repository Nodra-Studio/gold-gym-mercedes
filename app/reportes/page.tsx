import ReportsClient from "@/components/reports-client";
import { AdminShell } from "@/components/admin-shell";
import { RestrictedFeature } from "@/components/restricted-feature";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Informes de administración" };
export default async function ReportsPage() {
  const user = await requirePageRole(["owner", "reception"], "/reportes");
  return <AdminShell role={user.role}>{user.role === "owner" ? <ReportsClient /> : <RestrictedFeature path="/reportes" />}</AdminShell>;
}
