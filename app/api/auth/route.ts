import { z } from 'zod';
import { authClient } from '@/lib/auth/client';
import { authConfigured } from '@/lib/auth/config';
import { afterLogin } from '@/lib/auth/navigation';
import { allowAuthAttempt } from '@/lib/auth/rate-limit';
import { body, ClubError, apiError } from '@/lib/server';
export const dynamic = 'force-dynamic';
const email = z.string().trim().email().max(254);
const password = z.string().min(8, 'Usá al menos 8 caracteres.').max(128);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), email, password: z.string().min(1).max(128), returnTo: z.string().optional() }),
  z.object({ action: z.literal('signup'), email, password }),
  z.object({ action: z.literal('recover'), email }),
  z.object({ action: z.literal('password'), password }),
  z.object({ action: z.literal('logout') }),
]);
const reply = (data: object) => Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  try {
    if (!authConfigured()) throw new ClubError('El acceso todavía no está configurado.', 503);
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ClubError('Origen no permitido.', 403);
    const parsed = schema.safeParse(await body(request, 4000));
    if (!parsed.success) throw new ClubError(parsed.error.issues[0]?.message ?? 'Revisá los datos.');
    const input = parsed.data;
    if ('email' in input && !await allowAuthAttempt(input.email, input.action)) throw new ClubError('Se alcanzó el límite de intentos. Volvé a probar en 15 minutos.', 429);
    const client = await authClient();
    const callback = new URL('/auth/callback', process.env.APP_URL!);
    if (input.action === 'login') {
      const { error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error) throw new ClubError('No pudimos iniciar sesión. Revisá tus datos y la confirmación del correo.', 401);
      return reply({ next: afterLogin(input.returnTo) });
    }
    if (input.action === 'signup') {
      callback.searchParams.set('next', '/portal');
      const { error } = await client.auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: callback.href } });
      if (error) throw new ClubError('No pudimos procesar el registro. Intentá nuevamente más tarde.', 400);
      return reply({ message: 'Revisá tu correo para confirmar la cuenta. El acceso al club debe habilitarlo la administración.' });
    }
    if (input.action === 'recover') {
      callback.searchParams.set('next', '/actualizar-clave');
      // Same answer for unknown accounts and provider refusal: no enumeration.
      await client.auth.resetPasswordForEmail(input.email, { redirectTo: callback.href });
      return reply({ message: 'Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.' });
    }
    // Signing out must also work when the session has expired or is absent.
    if (input.action === 'logout') {
      const { error: logoutError } = await client.auth.signOut({ scope: 'local' });
      if (logoutError) throw new ClubError('No pudimos cerrar la sesión. Volvé a intentar.', 503);
      return reply({ next: '/acceso' });
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new ClubError('Iniciá sesión o abrí nuevamente el enlace del correo.', 401);
    if (input.action === 'password') {
      if (!await allowAuthAttempt(data.user.id, 'password')) throw new ClubError('Esperá 15 minutos antes de cambiar nuevamente la contraseña.', 429);
      const { error: updateError } = await client.auth.updateUser({ password: input.password });
      if (updateError) throw new ClubError('No pudimos actualizar la contraseña. Solicitá un nuevo enlace.', 400);
      const { error: signoutError } = await client.auth.signOut({ scope: 'global' });
      if (signoutError) throw new ClubError('La contraseña cambió, pero no pudimos cerrar todas las sesiones. Volvé a cerrar sesión.', 503);
      return reply({ next: '/acceso?changed=1' });
    }
  } catch (error) { return apiError(error); }
}
