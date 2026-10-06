import { requirePageRole } from '@/lib/page-access';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRole(['owner'], '/reportes');
  return children;
}
