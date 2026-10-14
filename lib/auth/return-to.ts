export function safeReturnTo(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/gestion';
  const url = new URL(value, 'https://club.local');
  if (url.origin !== 'https://club.local' || url.pathname.startsWith('/auth/') || url.pathname === '/acceso') return '/gestion';
  return url.pathname + url.search;
}
