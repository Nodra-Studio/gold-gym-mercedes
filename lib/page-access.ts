import { redirect } from 'next/navigation';
import { principal, ClubError, type ClubRole } from '@/lib/server';
export async function requirePageRole(roles: ClubRole[], path: string) {
  let user;
  try { user = await principal(); }
  catch (error) {
    if (error instanceof ClubError && error.status === 401) redirect('/acceso?returnTo=' + encodeURIComponent(path));
    if (error instanceof ClubError && error.status === 403) redirect('/cuenta');
    throw error;
  }
  if (!roles.includes(user.role)) redirect('/cuenta');
  return user;
}
