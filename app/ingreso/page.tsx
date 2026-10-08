import GateTerminal from '@/components/gate-terminal';
import { requirePageRole } from '@/lib/page-access';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terminal de ingreso', robots: { index: false, follow: false } };
export default async function Page() {
  await requirePageRole(['owner', 'reception', 'gate'], '/ingreso');
  return <GateTerminal />;
}
