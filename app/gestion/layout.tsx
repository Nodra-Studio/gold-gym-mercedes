import { AdminShell } from "@/components/admin-shell";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageRole(["owner", "reception"], "/gestion");
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}>{children}</AdminShell>;
}
