import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('lib/import-members.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseMembersCsv } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const header = 'Nombre,DNI,Teléfono,Plan,Estado,Vencimiento';
const row = 'Persona de prueba,12345678,,Musculación,Activo,2026-12-01';
test('Legacy CSV remains importable without assigning a branch', () => {
  assert.equal('homeBranch' in parseMembersCsv(header + '\n' + row)[0], false);
});
test('Optional explicit branch names preserve Union and unknown history', () => {
  for (const [label, expected] of [['Calle 30', 'calle30'], ['Calle 23', 'calle23'], ['Club Unión · gimnasio y pádel', 'velez'], ['Gold Pilates', 'pilates'], ['', null], ['Sin sede registrada', null]])
    assert.equal(parseMembersCsv(header + ',Sede\n' + row + ',' + label)[0].homeBranch, expected);
  assert.throws(() => parseMembersCsv(header + ',Sede\n' + row + ',Otra sede'), /sede debe ser/);
});
