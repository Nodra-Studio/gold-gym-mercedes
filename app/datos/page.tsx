import DataClient from "@/components/data-client";
import { AdminShell } from "@/components/admin-shell";
import { RestrictedFeature } from "@/components/restricted-feature";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Datos y respaldos" };
export default async function DataPage() {
  const user = await requirePageRole(["owner", "reception"], "/datos");
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}>{user.role === "owner" ? <DataClient /> : <RestrictedFeature path="/datos" />}</AdminShell>;
}
