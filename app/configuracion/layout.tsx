import { AdminShell } from "@/components/admin-shell";
import { requirePageRole } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageRole(["owner"], "/configuracion");
  return <AdminShell role={user.role}>{children}</AdminShell>;
}
