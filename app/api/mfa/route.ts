import { z } from 'zod';
import { authClient } from '@/lib/auth/client';
import { authConfigured, ownerAccount } from '@/lib/auth/config';
import { allowAuthAttempt } from '@/lib/auth/rate-limit';
import { maskedPhone, sessionMfaState } from '@/lib/auth/mfa';
import { body, database, ClubError, apiError } from '@/lib/server';
export const dynamic = 'force-dynamic';
const factorId = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enroll'), factorType: z.enum(['phone', 'totp']).default('totp'), phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional() }).strict()
    .refine(value => value.factorType !== 'phone' || !!value.phone),
  z.object({ action: z.literal('challenge'), factorId }).strict(),
  z.object({ action: z.literal('verify'), factorId, challengeId: z.string().uuid(), code: z.string().regex(/^\d{6,10}$/) }).strict(),
  z.object({ action: z.literal('remove'), factorId }).strict(),
]);
const reply = (value: object) => Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });
async function account() {
  if (!authConfigured()) throw new ClubError('El acceso todavía no está configurado.', 503);
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) throw new ClubError('Iniciá sesión para revisar tu seguridad.', 401);
  const staff = ownerAccount(data.user.id) ? null : await database()
    .prepare('SELECT role,status FROM staff WHERE user_id=?').bind(data.user.id)
    .first<{ role: string; status: string }>();
  const canEnroll = ownerAccount(data.user.id) || (staff?.status === 'active' && ['owner', 'reception', 'gate'].includes(staff.role));
  return { client, user: data.user, canEnroll };
}
export async function GET() {
  try {
    const { client, user, canEnroll } = await account();
    const security = await sessionMfaState(client, user);
    return reply({ ...security, authenticatorEnrollmentEnabled: canEnroll, smsEnrollmentEnabled: canEnroll && process.env.GOLD_GYM_SMS_MFA_ENABLED === 'true',
      factors: (user.factors ?? []).filter(f => ['phone', 'totp'].includes(f.factor_type)).map(f => ({
        id: f.id, type: f.factor_type, status: f.status,
        label: f.factor_type === 'phone' ? 'SMS ' + (maskedPhone('phone' in f && typeof f.phone === 'string' ? f.phone : undefined) || 'al teléfono registrado') : 'Aplicación autenticadora',
      })) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ClubError('Origen no permitido.', 403);
    const parsed = schema.safeParse(await body(request, 2000));
    if (!parsed.success) throw new ClubError('Revisá el teléfono o el código de verificación.');
    const input = parsed.data;
    const { client, user, canEnroll } = await account();
    if (!await allowAuthAttempt(user.id, 'mfa-' + input.action)) throw new ClubError('Se alcanzó el límite de intentos. Volvé a probar en 15 minutos.', 429);
    const security = await sessionMfaState(client, user);
    if (input.action === 'enroll') {
      if (!canEnroll) throw new ClubError('La administración debe habilitar tu acceso antes de configurar esta verificación.', 403);
      if (input.factorType === 'phone' && process.env.GOLD_GYM_SMS_MFA_ENABLED !== 'true') throw new ClubError('La verificación por SMS todavía no está habilitada en el club.', 503);
      if (security.requiresVerification) throw new ClubError('Verificá tu sesión con el método actual antes de agregar otro.', 403);
      const result = await client.auth.mfa.enroll(input.factorType === 'phone'
        ? { factorType: 'phone', phone: input.phone! }
        : { factorType: 'totp', issuer: 'Gold Gym Mercedes', friendlyName: 'Aplicación autenticadora Gold Gym' });
      if (result.error || !result.data) throw new ClubError('No pudimos configurar la verificación. Intentá nuevamente más tarde.', 400);
      return reply({ factorId: result.data.id, ...('totp' in result.data ? { totpSetup: { qr: result.data.totp.qr_code, secret: result.data.totp.secret } } : {}) });
    }
    const factor = (user.factors ?? []).find(f => f.id === input.factorId);
    if (!factor || !['phone', 'totp'].includes(factor.factor_type)) throw new ClubError('Ese método de verificación no está disponible.', 404);
    if (input.action !== 'remove' && security.requiresVerification && factor.status !== 'verified')
      throw new ClubError('Usá un método ya confirmado para verificar esta sesión.', 403);
    if (input.action === 'challenge') {
      const result = await client.auth.mfa.challenge(factor.factor_type === 'phone'
        ? { factorId: factor.id, channel: 'sms' } : { factorId: factor.id });
      if (result.error || !result.data) throw new ClubError('No pudimos preparar la verificación. Esperá un momento y volvé a intentar.', 503);
      return reply({ challengeId: result.data.id, expiresAt: result.data.expires_at });
    }
    if (input.action === 'verify') {
      const result = await client.auth.mfa.verify({ factorId: factor.id, challengeId: input.challengeId, code: input.code });
      if (result.error) throw new ClubError('El código no es válido o venció. Revisalo o solicitá uno nuevo.', 400);
      return reply({ verified: true });
    }
    if (factor.status === 'verified' && security.requiresVerification) throw new ClubError('Verificá tu sesión antes de quitar este método.', 403);
    const result = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (result.error) throw new ClubError('No pudimos quitar el método. Volvé a intentar.', 400);
    return reply({ removed: true });
  } catch (error) { return apiError(error); }
}
