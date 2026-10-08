import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync('proxy.ts', 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function setup({ configured = true, sites = false } = {}) {
  let calls = 0;
  const requestCookies = new Map([['sb-test-auth-token', 'old']]);
  const result = () => ({ headers: new Headers(), cookies: { values: [], set(name, value, options) { this.values.push({ name, value, options }); } } });
  const NextResponse = { next: result, redirect: url => ({ destination: url.href }), rewrite: result, json: (body, options) => Response.json(body, options) };
  const createServerClient = (_url, _key, options) => ({ auth: { async getClaims() {
    calls++;
    assert.equal(options.cookies.getAll()[0].value, 'old');
    assert.equal(options.cookieOptions.httpOnly, true);
    options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true, sameSite: 'lax', path: '/' } }]);
    return { data: { claims: { sub: 'user' } }, error: null };
  } } });
  const { proxy, config } = new Function('authConfigured','supportsSitesIdentity','NextResponse','createServerClient', compiled + '\nreturn { proxy, config };')(() => configured, sites, NextResponse, createServerClient);
  const request = { url: 'https://club.test/ingreso', nextUrl: { pathname: '/ingreso' }, cookies: { getAll: () => [...requestCookies].map(([name,value]) => ({name,value})), set: (name,value) => requestCookies.set(name,value) } };
  return { proxy, config, request, requestCookies, calls: () => calls };
}
test('Session refresh is forwarded to the rendered request and persisted in the browser', async () => {
  const { proxy, request, requestCookies, calls } = setup();
  const response = await proxy(request);
  assert.equal(calls(), 1);
  assert.equal(requestCookies.get('sb-test-auth-token'), 'renewed');
  assert.deepEqual(response.cookies.values, [{ name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true, sameSite: 'lax', path: '/' } }]);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});
test('Every private entry point participates in session refresh', () => {
  const { config } = setup();
  for (const route of ['portal','cuenta','acceso','caja','gestion','ingreso','reservas','equipo','datos','reportes','configuracion','actualizar-clave']) assert.ok(config.matcher.includes('/'+route+'/:path*'), route);
});
test('Sites identity does not call Supabase session refresh', async () => {
  const { proxy, request, calls } = setup({ sites: true });
  await proxy(request);
  assert.equal(calls(), 0);
});
