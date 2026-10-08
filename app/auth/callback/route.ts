import { NextResponse } from 'next/server';
import { authClient } from '@/lib/auth/client';
import { authConfigured } from '@/lib/auth/config';
import { afterLogin } from '@/lib/auth/navigation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL || url.origin;
  const code = url.searchParams.get('code');
  if (authConfigured() && code) {
    const client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(afterLogin(url.searchParams.get('next')), base), { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  return NextResponse.redirect(new URL('/acceso?error=link', base), { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
