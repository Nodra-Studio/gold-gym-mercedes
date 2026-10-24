import ReportsClient from "@/components/reports-client";
import { AdminShell } from "@/components/admin-shell";
import { RestrictedFeature } from "@/components/restricted-feature";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Informes" };
export default async function ReportsPage() {
  const user = await requirePageRole(["owner", "reception"], "/reportes");
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}>{user.role === "owner" ? <ReportsClient /> : <RestrictedFeature path="/reportes" />}</AdminShell>;
}
