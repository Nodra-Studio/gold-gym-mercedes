import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync('proxy.ts', 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function setup({
  configured = true,
  sites = false,
  path = '/ingreso',
  claims = { sub: 'user', aal: 'aal1' },
  assurance = { currentLevel: 'aal1', nextLevel: 'aal1' },
  assuranceError = null,
} = {}) {
  let calls = 0, assuranceCalls = 0;
  const requestCookies = new Map([['sb-test-auth-token', 'old']]);
  const result = (response = new Response()) => {
    response.cookies = {
      values: [],
      set(name, value, options) {
        this.values.push(typeof name === 'object' ? name : { name, value, options });
      },
      getAll() { return this.values; },
    };
    return response;
  };
  const NextResponse = {
    next: () => result(),
    redirect: url => {
      const response = result(new Response(null, { status: 307, headers: { location: url.href } }));
      response.destination = url.href;
      return response;
    },
    rewrite: (_url, options) => result(new Response(null, options)),
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
    return { data: assurance, error: assuranceError };
  } } } });
  const { proxy, config } = new Function('authConfigured','supportsSitesIdentity','NextResponse','createServerClient', compiled + '\nreturn { proxy, config };')(() => configured, sites, NextResponse, createServerClient);
  const nextUrl = new URL(path, 'https://club.test');
  const request = { url: nextUrl.href, nextUrl, cookies: { getAll: () => [...requestCookies].map(([name,value]) => ({name,value})), set: (name,value) => requestCookies.set(name,value) } };
  return { proxy, config, request, requestCookies, calls: () => calls, assuranceCalls: () => assuranceCalls };
}
const renewedCookie = { name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true, sameSite: 'lax', path: '/' } };
function assertPrivate(response) {
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
}
test('Session refresh is forwarded to the rendered request and persisted in the browser', async () => {
  const { proxy, request, requestCookies, calls } = setup();
  const response = await proxy(request);
  assert.equal(calls(), 1);
  assert.equal(requestCookies.get('sb-test-auth-token'), 'renewed');
  assert.deepEqual(response.cookies.values, [renewedCookie]);
  assertPrivate(response);
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
test('Sites identity does not call Supabase session refresh', async () => {
  const { proxy, request, calls } = setup({ sites: true });
  await proxy(request);
  assert.equal(calls(), 0);
});
