import { AdminShell } from "@/components/admin-shell";
import { requirePageRole } from "@/lib/page-access";
import Tariffs from "@/components/tariffs-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Planes y membresías" };
export default async function Page({ searchParams }: { searchParams: Promise<{ crear?: string | string[] }> }) {
  const user = await requirePageRole(["owner", "reception"], "/tarifas"), params = await searchParams;
  return <AdminShell role={user.role} scope={{activity_scope:user.activity_scope,branch_scope:user.branch_scope}}><Tariffs initialCreate={params.crear === "1"} /></AdminShell>;
}
