// Deliberately exclude messages, stacks, SQL, URLs and request data from logs.
const knownCodes = new Set([
  '28P01', '28000', '42501', '42P01', '3F000', '42703', '53300', '57P01',
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CONNECT_TIMEOUT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export function diagnosticCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && knownCodes.has(code)) return code;
  return 'UNKNOWN';
}

export function logBackendFailure(error: unknown): void {
  console.error(JSON.stringify({ event: 'backend_unavailable', code: diagnosticCode(error) }));
}
