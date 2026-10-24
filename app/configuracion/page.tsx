import SettingsClient from "@/components/settings-client";
import { AdminShell } from "@/components/admin-shell";
import { RestrictedFeature } from "@/components/restricted-feature";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Reglas de pádel" };
export default async function SettingsPage() {
  const user = await requirePageRole(["owner", "reception"], "/configuracion");
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}>{user.role === "owner" ? <SettingsClient /> : <RestrictedFeature path="/configuracion" />}</AdminShell>;
}
