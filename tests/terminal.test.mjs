import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async path => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const { accessDecision } = await load('lib/club.ts');
const { terminalDisplay } = await load('lib/terminal-display.ts');
const today = '2026-10-08';
function display(member) { return terminalDisplay({ ...accessDecision(member, today), name: 'Socio de prueba' }); }
test('A valid membership outside the warning window shows green', () => {
  const result = display({ status: 'active', expires: '2026-10-16' });
  assert.equal(result.tone, 'ready');
  assert.equal(result.title, 'Podés ingresar');
});
test('Seven days, one day and the expiration day show amber without denying access', () => {
  for (const [expires, detail] of [['2026-10-15', 'Tu cuota vence en 7 días'], ['2026-10-09', 'Tu cuota vence en 1 día'], ['2026-10-08', 'Tu cuota vence hoy']]) {
    const result = display({ status: 'active', expires });
    assert.equal(result.tone, 'warning');
    assert.equal(result.title, 'Podés ingresar');
    assert.equal(result.detail, detail);
  }
});
test('Expired, paused and unregistered members never receive a green signal', () => {
  for (const member of [null, { status: 'paused', expires: '2026-11-01' }, { status: 'active', expires: '2026-10-07' }]) {
    const result = display(member);
    assert.equal(result.tone, 'stop');
    assert.equal(result.title, 'Pasá por recepción');
  }
});
test('A rejection takes priority even if the response also carries a warning', () => {
  const result = terminalDisplay({ allowed: false, name: null, reason: 'Cuota vencida', warning: 'Renová tu cuota' });
  assert.equal(result.tone, 'stop');
  assert.equal(result.detail, 'Cuota vencida');
});
