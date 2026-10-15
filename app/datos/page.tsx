import DataClient from "@/components/data-client";
import { AdminShell } from "@/components/admin-shell";
import { RestrictedFeature } from "@/components/restricted-feature";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Importación y respaldos" };
export default async function DataPage() {
  const user = await requirePageRole(["owner", "reception"], "/datos");
  return <AdminShell role={user.role}>{user.role === "owner" ? <DataClient /> : <RestrictedFeature path="/datos" />}</AdminShell>;
}
