import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { contentSecurityPolicy } from '../lib/security-headers.mjs';
import { NextRequest as NativeNextRequest, NextResponse as NativeNextResponse } from 'next/server.js';
const source = readFileSync('proxy.ts', 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function setup({
  configured = true,
  sites = false,
  path = '/ingreso',
  claims = { sub: 'user', aal: 'aal1' },
  assurance = { currentLevel: 'aal1', nextLevel: 'aal1' },
  assuranceError = null,
  headers = {},
  mfaCookie = null,
  native = false,
} = {}) {
  let calls = 0, assuranceCalls = 0;
  const forwardedHeaders = [];
  const requestCookies = new Map([['sb-test-auth-token', 'old']]);
  const requestHeaders = new Headers({ ...headers, cookie: 'sb-test-auth-token=old' });
  const result = (response = new Response()) => {
    const values = new Map();
    response.cookies = {
      get values() { return [...values.values()]; },
      set(name, value, options) {
        const cookie = typeof name === 'object' ? name : { name, value, options };
        values.set(cookie.name, cookie);
      },
      getAll() { return [...values.values()]; },
    };
    return response;
  };
  const NextResponse = native ? NativeNextResponse : {
    next: options => {
      const response = result();
      response.requestHeaders = new Headers(options?.request?.headers);
      forwardedHeaders.push(response.requestHeaders);
      return response;
    },
    redirect: url => {
      const response = result(new Response(null, { status: 307, headers: { location: url.href } }));
      response.destination = url.href;
      return response;
    },
    rewrite: (_url, options) => {
      const response = result(new Response(null, options));
      response.requestHeaders = new Headers(options?.request?.headers);
      return response;
    },
    json: (body, options) => result(Response.json(body, options)),
  };
  const createServerClient = (_url, _key, options) => ({ auth: { async getClaims() {
    calls++;
    assert.equal(options.cookies.getAll()[0].value, 'old');
    assert.equal(options.cookieOptions.httpOnly, true);
    options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true, sameSite: 'lax', path: '/' } }]);
    return { data: { claims }, error: null };
  }, mfa: { async getAuthenticatorAssuranceLevel() {
    assuranceCalls++;
    if (mfaCookie) options.cookies.setAll([mfaCookie]);
    return { data: assurance, error: assuranceError };
  } } } });
  const { proxy, config } = new Function('authConfigured','supportsSitesIdentity','NextResponse','createServerClient','contentSecurityPolicy', compiled + '\nreturn { proxy, config };')(() => configured, sites, NextResponse, createServerClient, contentSecurityPolicy);
  const nextUrl = new URL(path, 'https://club.test');
  const request = native ? new NativeNextRequest(nextUrl, { headers: requestHeaders }) : { url: nextUrl.href, nextUrl, headers: requestHeaders, cookies: {
    getAll: () => [...requestCookies].map(([name,value]) => ({name,value})),
    set(name, value) {
      requestCookies.set(name, value);
      requestHeaders.set('cookie', [...requestCookies].map(([key,item]) => key + '=' + item).join('; '));
    },
  } };
  return { proxy, config, request, requestCookies, forwardedHeaders, calls: () => calls, assuranceCalls: () => assuranceCalls };
}
const renewedCookie = { name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true, sameSite: 'lax', path: '/' } };
function assertPrivate(response) {
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}
function assertNoncePolicy(response) {
  const policy = response.headers.get('content-security-policy');
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, 'private HTML has a trusted script nonce');
  assert.equal(Buffer.from(nonce, 'base64').length, 16);
  assert.match(policy, /'strict-dynamic'/);
  assert.doesNotMatch(policy.split(';').find(item => item.trim().startsWith('script-src ')), /unsafe-inline/);
  return nonce;
}
test('Session refresh is forwarded to the rendered request and persisted in the browser', async () => {
  const { proxy, request, requestCookies, calls, forwardedHeaders } = setup({ headers: { 'x-custom-render': 'keep' } });
  const response = await proxy(request);
  assert.equal(calls(), 1);
  assert.equal(requestCookies.get('sb-test-auth-token'), 'renewed');
  assert.deepEqual(response.cookies.values, [renewedCookie]);
  const nonce = assertNoncePolicy(response);
  assert.equal(response.requestHeaders.get('x-nonce'), nonce);
  assert.equal(response.requestHeaders.get('content-security-policy'), response.headers.get('content-security-policy'));
  assert.equal(response.requestHeaders.get('cookie'), 'sb-test-auth-token=renewed');
  assert.equal(response.requestHeaders.get('x-custom-render'), 'keep');
  assert.equal(forwardedHeaders[0].get('x-nonce'), nonce);
  assert.equal(forwardedHeaders[0].get('cookie'), 'sb-test-auth-token=old');
  assertPrivate(response);
});
test('Private HTML replaces untrusted CSP and nonce headers with a fresh nonce per request', async () => {
  const values = [];
  for (let i = 0; i < 2; i++) {
    const { proxy, request } = setup({ headers: {
      'x-nonce': 'attacker-chosen', 'content-security-policy': "script-src 'nonce-attacker-chosen'",
      'content-security-policy-report-only': "script-src https://attacker.test",
    } });
    const response = await proxy(request);
    const nonce = assertNoncePolicy(response);
    values.push(nonce);
    assert.equal(response.requestHeaders.get('x-nonce'), nonce);
    assert.equal(response.requestHeaders.get('content-security-policy-report-only'), null);
    assert.doesNotMatch(response.requestHeaders.get('content-security-policy'), /attacker/);
  }
  assert.notEqual(values[0], values[1]);
});
test('Native Next request and response carry the trusted nonce and freshly renewed Cookie into SSR', async () => {
  const { proxy, request } = setup({ native: true, headers: { 'x-nonce': 'attacker' } });
  const response = await proxy(request);
  const nonce = assertNoncePolicy(response);
  assert.equal(request.headers.get('cookie'), 'sb-test-auth-token=renewed');
  assert.equal(response.headers.get('x-middleware-request-cookie'), 'sb-test-auth-token=renewed');
  assert.equal(response.headers.get('x-middleware-request-x-nonce'), nonce);
  assert.equal(response.headers.get('x-middleware-request-content-security-policy'), response.headers.get('content-security-policy'));
  assert.equal(response.cookies.get('sb-test-auth-token').value, 'renewed');
  assert.equal(response.cookies.get('sb-test-auth-token').httpOnly, true);
  assertPrivate(response);
});
test('Subsequent MFA cookie refresh preserves all browser cookies and forwards the latest request', async () => {
  const extraCookie = { name: 'sb-secondary-auth-token', value: 'new', options: { httpOnly: true, sameSite: 'lax', path: '/' } };
  const { proxy, request, forwardedHeaders } = setup({ mfaCookie: extraCookie });
  const response = await proxy(request);
  assert.deepEqual(response.cookies.values, [renewedCookie, extraCookie]);
  assert.equal(response.requestHeaders.get('cookie'), 'sb-test-auth-token=renewed; sb-secondary-auth-token=new');
  const nonce = assertNoncePolicy(response);
  assert.equal(forwardedHeaders.length, 3);
  for (const headers of forwardedHeaders) assert.equal(headers.get('x-nonce'), nonce);
});
test('Every private entry point participates in session refresh', () => {
  const { config } = setup();
  for (const route of ['portal','cuenta','acceso','caja','gestion','ingreso','reservas','equipo','datos','reportes','configuracion','actualizar-clave','verificar','auth','api']) assert.ok(config.matcher.includes('/'+route+'/:path*'), route);
});
test('MFA redirects private pages and carries refreshed cookies and the original destination', async () => {
  const { proxy, request, requestCookies, assuranceCalls } = setup({
    path: '/ingreso?sede=calle30', assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
  });
  const response = await proxy(request);
  assert.equal(response.status, 307);
  assert.equal(response.destination, 'https://club.test/verificar?next=%2Fingreso%3Fsede%3Dcalle30');
  assert.equal(assuranceCalls(), 1);
  assert.equal(requestCookies.get('sb-test-auth-token'), 'renewed');
  assert.deepEqual(response.cookies.values, [renewedCookie]);
  assertPrivate(response);
  assertNoncePolicy(response);
});
test('MFA blocks private API calls with a JSON error and persists refreshed cookies', async () => {
  const { proxy, request, assuranceCalls } = setup({
    path: '/api/club', assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
  });
  const response = await proxy(request);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Completá la verificación en dos pasos para abrir la gestión.', code: 'MFA_REQUIRED', next: '/verificar',
  });
  assert.equal(assuranceCalls(), 1);
  assert.deepEqual(response.cookies.values, [renewedCookie]);
  assertPrivate(response);
  assert.equal(response.headers.get('content-security-policy'), null);
});
test('MFA assurance failures keep private pages and APIs closed with refreshed cookies', async () => {
  for (const failure of [{ assuranceError: { message: 'Provider failed' } }, { assurance: null }, { assurance: { currentLevel: null } }]) {
    for (const path of ['/api/team', '/gestion?tab=socios']) {
      const { proxy, request } = setup({ path, ...failure });
      const response = await proxy(request);
      assert.equal(response.status, path.startsWith('/api/') ? 503 : 307);
      if (path.startsWith('/api/')) assert.match((await response.json()).error, /seguridad de la sesión/);
      else assert.equal(new URL(response.destination).searchParams.get('next'), path);
      assert.deepEqual(response.cookies.values, [renewedCookie]);
      assertPrivate(response);
    }
  }
});
test('Assurance level two allows private requests without another MFA provider call', async () => {
  for (const path of ['/gestion', '/api/club']) {
    const { proxy, request, assuranceCalls } = setup({ path, claims: { sub: 'user', aal: 'aal2' } });
    const response = await proxy(request);
    assert.equal(response.status, 200);
    assert.equal(assuranceCalls(), 0);
    assert.deepEqual(response.cookies.values, [renewedCookie]);
    assertPrivate(response);
  }
});
test('An account without a verified factor can use private requests at assurance level one', async () => {
  const { proxy, request, assuranceCalls } = setup({ path: '/api/club' });
  const response = await proxy(request);
  assert.equal(response.status, 200);
  assert.equal(assuranceCalls(), 1);
  assertPrivate(response);
});
test('Account and MFA routes refresh the session without trapping verification or recovery', async () => {
  for (const path of ['/api/auth', '/api/mfa', '/verificar?next=%2Fingreso', '/auth/callback', '/actualizar-clave', '/acceso', '/crear-cuenta', '/recuperar']) {
    const { proxy, request, calls, assuranceCalls } = setup({
      path, assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
    });
    const response = await proxy(request);
    assert.equal(response.status, 200, path);
    assert.equal(calls(), 1, path);
    assert.equal(assuranceCalls(), 0, path);
    assert.deepEqual(response.cookies.values, [renewedCookie], path);
    assertPrivate(response);
  }
});
test('Public endpoints do not refresh sessions or enforce MFA', async () => {
  for (const path of ['/api/public-padel', '/api/padel-weather', '/api/public-prices']) {
    const { proxy, request, calls, assuranceCalls } = setup({ path });
    const response = await proxy(request);
    assert.equal(response.status, 200);
    assert.equal(calls(), 0);
    assert.equal(assuranceCalls(), 0);
  }
});
test('Missing auth configuration returns an unavailable private API without accessing Supabase', async () => {
  const { proxy, request, calls } = setup({ path: '/api/club', configured: false });
  const response = await proxy(request);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(calls(), 0);
});
test('Unavailable private HTML keeps the prerendered fallback compatible and strips incoming nonces', async () => {
  const { proxy, request, calls } = setup({ configured: false, headers: {
    'x-nonce': 'attacker', 'content-security-policy': "script-src 'nonce-attacker'",
    'content-security-policy-report-only': "script-src 'none'",
  } });
  const response = await proxy(request);
  assert.equal(calls(), 0);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /nonce-/);
  assert.equal(response.requestHeaders.get('x-nonce'), null);
  assert.equal(response.requestHeaders.get('content-security-policy-report-only'), null);
  assert.equal(response.requestHeaders.get('content-security-policy'), response.headers.get('content-security-policy'));
});
test('Private APIs strip spoofed renderer security headers without generating an HTML nonce', async () => {
  const { proxy, request } = setup({ path: '/api/club', headers: {
    'x-nonce': 'attacker', 'content-security-policy': "script-src 'nonce-attacker'",
    'content-security-policy-report-only': "script-src 'none'",
  } });
  const response = await proxy(request);
  assert.equal(response.requestHeaders.get('x-nonce'), null);
  assert.equal(response.requestHeaders.get('content-security-policy'), null);
  assert.equal(response.requestHeaders.get('content-security-policy-report-only'), null);
  assert.equal(response.headers.get('content-security-policy'), null);
  assert.equal(response.requestHeaders.get('cookie'), 'sb-test-auth-token=renewed');
});
test('Sites identity does not call Supabase session refresh', async () => {
  const { proxy, request, calls } = setup({ sites: true });
  await proxy(request);
  assert.equal(calls(), 0);
});
