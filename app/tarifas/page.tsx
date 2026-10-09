import {AdminShell} from '@/components/admin-shell';
import {requirePageRole} from '@/lib/page-access';
import Tariffs from '@/components/tariffs-client';
export const dynamic='force-dynamic';
export default async function Page(){const p=await requirePageRole(['owner','reception'],'/tarifas');return <AdminShell role={p.role}><Tariffs/></AdminShell>}
