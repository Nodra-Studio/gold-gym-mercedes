import type { SupabaseClient, User } from '@supabase/supabase-js';
import { safeReturnTo } from './config';

export function mfaReturnTo(value: unknown) {
  const next = safeReturnTo(value);
  return next.startsWith('/api/') || next.startsWith('/verificar') ? '/portal' : next;
}

export function verifiedMfaFactors(user: Pick<User, 'factors'>) {
  return (user.factors ?? []).filter(factor => factor.status === 'verified');
}

export async function sessionMfaState(client: SupabaseClient, user: User) {
  const verified = verifiedMfaFactors(user);
  if (!verified.length) return { requiresVerification: false, currentLevel: null };
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw new Error('MFA assurance could not be checked');
  return { requiresVerification: data.currentLevel !== 'aal2', currentLevel: data.currentLevel };
}

export function maskedPhone(phone?: string) {
  return phone ? '•••• ' + phone.slice(-4) : '';
}
