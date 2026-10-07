import { requirePageRole } from "@/lib/page-access";
import { AdminShell } from "@/components/admin-shell";
import { CashClient } from "@/components/cash-client";
export default async function Page() {
  const user = await requirePageRole(["owner", "reception"], "/caja");
  return (
    <AdminShell role={user.role}>
      <CashClient />
    </AdminShell>
  );
}
