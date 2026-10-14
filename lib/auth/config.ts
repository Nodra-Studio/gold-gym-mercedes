export function authConfigured() {
  if (!process.env.SUPABASE_PUBLISHABLE_KEY || !(process.env.DATABASE_URL || process.env.DATABASEURL) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.GOLD_GYM_OWNER_ID ?? '')) return false;
  try {
    const auth = new URL(process.env.SUPABASE_URL ?? '');
    const app = new URL(process.env.APP_URL ?? '');
    return auth.protocol === 'https:' && (app.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && app.hostname === 'localhost'));
  } catch { return false; }
}
export { safeReturnTo } from './return-to';
export function ownerAccount(userId: string) {
  return /^[0-9a-f-]{36}$/i.test(process.env.GOLD_GYM_OWNER_ID ?? '') && process.env.GOLD_GYM_OWNER_ID === userId;
}
