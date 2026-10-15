import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { browserSecurityHeaders } from '../lib/security-headers.mjs';

const port = 4319;
const base = `http://127.0.0.1:${port}`;
function assertSecurity(response) {
  for (const { key, value } of browserSecurityHeaders) {
    const actual = response.headers.get(key);
    if (key === 'Referrer-Policy' && actual === 'no-referrer') continue;
    assert.equal(actual, value, key);
  }
  assert.equal(response.headers.get('x-powered-by'), null);
  const policy = response.headers.get('content-security-policy');
  assert.ok(policy, 'Enforced CSP is present');
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "form-action 'self'", "worker-src 'self'"])
    assert.ok(policy.includes(directive), directive);
}
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base)).ok; } catch {}
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, `Next server did not start: ${logs}`);
  for (const path of ['/', '/club', '/padel', '/pilates', '/turnos', '/propuesta', '/acceso', '/recuperar', '/crear-cuenta', '/actualizar-clave']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assertSecurity(res);
    assert.match(await res.text(), /Gold Gym/);
  }
  const spoofed = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' };
  for (const path of ['/gestion', '/tarifas', '/ingreso', '/reservas', '/jugar', '/configuracion', '/equipo', '/datos', '/datos-fiscales', '/verificar', '/reportes', '/signin-with-chatgpt']) {
    const res = await fetch(base + path, { headers: spoofed });
    assertSecurity(res);
    assert.match(await res.text(), /La gestión todavía no está habilitada/);
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
  }
  for (const path of ['auth', 'mfa', 'offline-access', 'fiscal-settings', 'club', 'tariffs', 'cash', 'backup', 'booking-payments', 'export', 'import-members', 'player', 'reports', 'settings', 'team']) {
    for (const method of ['GET', 'POST']) {
      const res = await fetch(`${base}/api/${path}`, { method, headers: spoofed });
      assertSecurity(res);
      assert.equal(res.status, 503, `${method} ${path}`);
      assert.match(res.headers.get('cache-control') ?? '', /no-store/);
      assert.match((await res.json()).error, /no está habilitada/);
    }
  }
  assert.equal((await fetch(base + '/favicon.jpg')).status, 200);
  const navigationStyles = await fetch(base + '/styles/site-navigation-noscript.css');
  assert.equal(navigationStyles.status, 200);
  assert.match(navigationStyles.headers.get('content-type') ?? '', /text\/css/);
  const terminal = await fetch(base + '/terminal-offline.html');
  assertSecurity(terminal);
  assert.match(terminal.headers.get('content-security-policy'), /script-src 'self';/);
  assert.doesNotMatch(terminal.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/);
  assert.match((await fetch(base)).headers.get('content-security-policy'), /img-src 'self' data: blob:/);
  console.log('Vercel smoke passed: public pages, private routes, API denial, assets and enforced security headers.');
} finally {
  server.kill('SIGTERM');
}
