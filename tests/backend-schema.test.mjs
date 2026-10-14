import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { verifyClubSchema, requiredClubTables } from '../scripts/backend-schema.mjs';

await test('Backend schema check validates current migrations and every protected table', async t => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const file of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
      await pg.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
    }
    const verify = () => verifyClubSchema(async query => (await pg.query(query)).rows);
    await t.test('Current complete schema passes', async () => {
      assert.equal(await verify(), requiredClubTables.length);
    });
    await t.test('Same table count cannot hide a missing application table', async () => {
      await pg.exec('BEGIN; DROP TABLE club.product_changes; CREATE TABLE club.replacement(id text); ALTER TABLE club.replacement ENABLE ROW LEVEL SECURITY;');
      try { await assert.rejects(verify(), /schema/); }
      finally { await pg.exec('ROLLBACK'); }
    });
    await t.test('Any table without RLS fails, including an extra table', async () => {
      await pg.exec('BEGIN; ALTER TABLE club.member_memberships DISABLE ROW LEVEL SECURITY;');
      try { await assert.rejects(verify(), /schema/); }
      finally { await pg.exec('ROLLBACK'); }
      await pg.exec('BEGIN; CREATE TABLE club.extra(id text);');
      try { await assert.rejects(verify(), /schema/); }
      finally { await pg.exec('ROLLBACK'); }
    });
    await t.test('Additional protected tables do not break readiness', async () => {
      await pg.exec('BEGIN; CREATE TABLE club.extra(id text); ALTER TABLE club.extra ENABLE ROW LEVEL SECURITY;');
      try { assert.equal(await verify(), requiredClubTables.length + 1); }
      finally { await pg.exec('ROLLBACK'); }
    });
  } finally { await pg.close(); }
});
