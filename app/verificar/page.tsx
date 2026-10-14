import TwoStepVerification from '@/components/two-step-verification';
import { mfaReturnTo } from '@/lib/auth/mfa';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verificación en dos pasos', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <TwoStepVerification next={mfaReturnTo((await searchParams).next ?? '/portal')} />;
}
