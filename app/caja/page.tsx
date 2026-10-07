import { requirePageRole } from "@/lib/page-access";
import { CashClient } from "@/components/cash-client";
export default async function Page() {
  await requirePageRole(["owner", "reception"], "/caja");
  return <CashClient />;
}
