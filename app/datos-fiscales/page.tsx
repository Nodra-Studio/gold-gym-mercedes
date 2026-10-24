import { AdminShell } from "@/components/admin-shell";
import FiscalSettings from "@/components/fiscal-settings";
import { requirePageRole } from "@/lib/page-access";
import { database } from "@/lib/server";
import { fiscalSelectFields, type FiscalIssuer } from "@/lib/fiscal-settings";
import { RestrictedFeature } from "@/components/restricted-feature";

export const dynamic = "force-dynamic";
export const metadata = { title: "Datos fiscales por sede" };

export default async function FiscalSettingsPage() {
  const user = await requirePageRole(["owner", "reception"], "/datos-fiscales");
  if (user.role !== "owner") return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}><RestrictedFeature path="/datos-fiscales" /></AdminShell>;
  const rows = await database()
    .prepare(`SELECT ${fiscalSelectFields} FROM issuer_settings WHERE owner=? ORDER BY venue`)
    .bind(user.owner)
    .all<FiscalIssuer>();
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}><FiscalSettings initialSettings={rows.results} /></AdminShell>;
}
