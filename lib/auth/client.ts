import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfigured } from './config';
export async function authClient() {
  if (!authConfigured()) throw new Error('Authentication is not configured');
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch (error) {
          // Server Components are read-only; the proxy has already persisted the refresh.
          if (!(error instanceof Error) || !error.message.includes('Cookies can only be modified')) throw error;
        }
      },
    },
  });
}
export async function independentUserId(): Promise<string | null> {
  if (!authConfigured()) return null;
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  return error || !data.user?.email_confirmed_at ? null : data.user.id;
}
