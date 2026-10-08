import { redirect } from 'next/navigation';
import { principal, ClubError } from '@/lib/server';
import { portalForRole } from '@/lib/auth/navigation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu espacio', robots: { index: false, follow: false } };
export default async function Portal() {
  let destination: string;
  try {
    const user = await principal();
    destination = portalForRole(user.role);
  } catch (error) {
    if (error instanceof ClubError && error.status === 401) destination = '/acceso';
    else if (error instanceof ClubError && error.status === 403) destination = '/cuenta';
    else throw error;
  }
  redirect(destination);
}
