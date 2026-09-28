import { database } from '@/lib/server';
import { logBackendFailure } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';

// Readiness only: never return configuration, account data or error details.
export async function GET() {
  try {
    await database().prepare('SELECT key FROM auth_limits LIMIT 0').all();
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logBackendFailure(error);
    return Response.json({ status: 'unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
