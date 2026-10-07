import { AdminShell } from "@/components/admin-shell";
import { requirePageRole } from "@/lib/page-access";
import TeamClient from "@/components/team-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo y permisos" };
export default async function TeamPage() {
  const user = await requirePageRole(["owner", "reception"], "/equipo");
  return (
    <AdminShell role={user.role}>
      <TeamClient />
    </AdminShell>
  );
}
