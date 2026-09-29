import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { databaseTLS, supabaseRootCA } from '../lib/postgres/tls.mjs';

test('Supabase CA is the official public root and remains valid', () => {
  const cert = new X509Certificate(supabaseRootCA);
  assert.equal(cert.ca, true);
  assert.equal(cert.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.ok(Date.parse(cert.validTo) > Date.now());
  assert.ok(cert.verify(cert.publicKey));
});
test('Additional CA is scoped to Supabase and never disables verification', () => {
  for (const host of ['aws-0-sa-east-1.pooler.supabase.com', 'db.example.supabase.co']) {
    const ssl = databaseTLS(`postgresql://user:password@${host}:6543/postgres`);
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.ca, supabaseRootCA);
    assert.equal(ssl.checkServerIdentity, undefined);
  }
  for (const host of ['localhost', 'db.example.com', 'supabase.co.evil.example', 'fakepooler.supabase.com']) {
    assert.equal(databaseTLS(`postgresql://user:password@${host}/postgres`), 'verify-full');
  }
});
