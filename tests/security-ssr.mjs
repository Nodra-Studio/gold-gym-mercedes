import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Public pages remain prerendered. This server enables native auth with no
// session, so login SSR can verify nonce injection without private credentials.
const port = 4321, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', APP_URL: 'https://club.example.test',
    SUPABASE_URL: 'https://example-project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    DATABASE_URL: 'postgresql://unused.invalid/test', GOLD_GYM_OWNER_ID: 'e1000000-0000-4000-8000-000000000001' },
  stdio: ['ignore','pipe','pipe'],
});
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
  assert.ok(ready, logs);
  const nonces = [];
  for (const path of ['/acceso','/crear-cuenta','/recuperar','/actualizar-clave','/verificar','/acceso']) {
    const response = await fetch(base + path, { headers: {
      'x-nonce': 'chosen-by-visitor',
      'content-security-policy': "script-src 'unsafe-inline'",
    } });
    assert.equal(response.status, 200, path);
    const policy = response.headers.get('content-security-policy');
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, path + ' has a nonce');
    assert.equal(Buffer.from(nonce,'base64').length,16);
    assert.doesNotMatch(policy.split(';').find(d=>d.trim().startsWith('script-src')), /unsafe-inline|unsafe-eval/);
    assert.match(policy, /strict-dynamic/);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.match(response.headers.get('cache-control'),/private/);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    nonces.push(nonce);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    assert.ok(scripts.length > 1, path + ' contains framework and hydration scripts');
    for (const [,attributes] of scripts) assert.ok(attributes.includes(`nonce="${nonce}"`), path + ' script has its response nonce');
    assert.doesNotMatch(html,/chosen-by-visitor/);
  }
  assert.equal(new Set(nonces).size,nonces.length,'A fresh nonce is generated for every response');
  const denied = await fetch(base + '/caja', {redirect:'manual',headers:{'oai-authenticated-user-id':'owner'}});
  assert.equal(denied.status,307);
  assert.match(denied.headers.get('location'),/\/acceso\?/);
  assert.match(denied.headers.get('cache-control'),/private/);
  assert.match(denied.headers.get('cache-control'),/no-store/);
  console.log('Security SSR passed: fresh nonces, matching framework scripts, cache protection and unauthorized cash redirect.');
} finally { server.kill('SIGTERM'); }
