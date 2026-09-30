import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 4319;
const base = `http://127.0.0.1:${port}`;
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
  for (const path of ['/', '/club', '/padel', '/propuesta', '/acceso', '/recuperar', '/crear-cuenta', '/actualizar-clave']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /Gold Gym/);
  }
  const spoofed = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' };
  for (const path of ['/gestion', '/ingreso', '/reservas', '/jugar', '/configuracion', '/equipo', '/datos', '/reportes', '/signin-with-chatgpt']) {
    const res = await fetch(base + path, { headers: spoofed });
    assert.match(await res.text(), /La gestión todavía no está habilitada/);
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
  }
  for (const path of ['auth', 'club', 'backup', 'booking-payments', 'export', 'import-members', 'player', 'reports', 'settings', 'team']) {
    for (const method of ['GET', 'POST']) {
      const res = await fetch(`${base}/api/${path}`, { method, headers: spoofed });
      assert.equal(res.status, 503, `${method} ${path}`);
      assert.match(res.headers.get('cache-control') ?? '', /no-store/);
      assert.match((await res.json()).error, /no está habilitada/);
    }
  }
  assert.equal((await fetch(base + '/favicon.jpg')).status, 200);
  console.log('Vercel smoke passed: public pages, private routes, API denial, spoofed headers and asset.');
} finally {
  server.kill('SIGTERM');
}
