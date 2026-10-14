/** Browser resource restrictions shared by Next configuration and private SSR. */
export function contentSecurityPolicy({ nonce = '', development = false, terminal = false } = {}) {
  if (nonce && !/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error('Invalid CSP nonce');
  const scripts = terminal ? "'self'" : nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'` : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scripts}${development && !terminal ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${terminal ? '' : " 'unsafe-inline'"}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export const browserSecurityHeaders = Object.freeze([
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self), clipboard-write=(self)' },
]);
