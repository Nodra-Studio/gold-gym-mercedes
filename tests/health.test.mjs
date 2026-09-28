import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const diagnosticsUrl = moduleUrl(readFileSync('lib/diagnostics.ts', 'utf8'));
const { diagnosticCode } = await import(diagnosticsUrl);
await test('Diagnostics never echo untrusted error content', () => {
  assert.equal(diagnosticCode({ code: '28P01', message: 'secret' }), '28P01');
  for (const error of [null, 'secret', { code: 'postgresql://secret' }, { message: 'secret', stack: 'secret' }]) assert.equal(diagnosticCode(error), 'UNKNOWN');
});
await test('Readiness uses a read-only query and keeps failures private', async () => {
  const original = readFileSync('app/api/health/route.ts', 'utf8');
  const output = [];
  const previous = console.error;
  console.error = value => output.push(value);
  try {
    for (const failed of [false, true]) {
      const source = original.replace("import { database } from '@/lib/server';", `const database = () => ({ prepare(sql) { if (sql !== 'SELECT key FROM auth_limits LIMIT 0') throw Error('unexpected query'); return { async all() { ${failed ? "throw {code:'28P01',message:'secret',query:'secret'}" : 'return {results:[]}'} } }; } });`).replace("'@/lib/diagnostics'", JSON.stringify(diagnosticsUrl));
      const { GET } = await import(moduleUrl(source));
      const response = await GET();
      assert.equal(response.status, failed ? 503 : 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { status: failed ? 'unavailable' : 'ok' });
    }
    assert.deepEqual(output, ['{"event":"backend_unavailable","code":"28P01"}']);
  } finally { console.error = previous; }
});
