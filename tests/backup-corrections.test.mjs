import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compilerOptions = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 };
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions }).outputText).toString('base64');
const clubUrl = asModule(readFileSync('lib/club.ts', 'utf8'));
const source = readFileSync('lib/backup.ts', 'utf8')
  .replace('"./club"', JSON.stringify(clubUrl))
  .replace('"zod"', JSON.stringify(pathToFileURL(require.resolve('zod')).href));
const { validateBackup } = await import(asModule(source));
const stamp = '2026-10-13T12:00:00.000Z';
const correctedAt = '2026-10-13T13:00:00.000Z';
const latestAt = '2026-10-13T14:00:00.000Z';
const common = (id, created_at = stamp) => ({ id, request_key: 'request-' + id, payload: '{}', created_at, actor: 'historic-owner' });
function fixture() {
  const first = { venue: 'calle30', kind: 'expense', category: 'Electricidad', concept: 'Factura electricidad', amount: -1000, method: 'Transferencia', day: '2026-10-13', revision: 1 };
  const second = { ...first, venue: 'calle23', amount: -1500, revision: 2 };
  const current = { ...second, method: 'Efectivo', revision: 3 };
  return {
    schemaVersion: 7, exportedAt: '2026-10-13T15:00:00.000Z',
    records: {
      plans: [], members: [], member_memberships: [], payments: [], accesses: [],
      bookings: [], booking_payments: [], sessions: [], enrollments: [], audit: [],
      products: [], stock_moves: [], product_changes: [], booking_requests: [],
      cash_entries: [
        { ...common('expense'), ...current, product_id: null, quantity: null, reverses: null },
        { ...common('income'), venue: 'calle30', kind: 'income', category: 'Otros ingresos', concept: 'Aporte de caja', amount: 2500, method: 'Efectivo', day: '2026-10-13', revision: 1, product_id: null, quantity: null, reverses: null },
      ],
      cash_entry_changes: [
        { ...common('change-one', correctedAt), cash_entry_id: 'expense', before_state: JSON.stringify(first), after_state: JSON.stringify(second), reason: 'Corregir sede e importe' },
        { ...common('change-two', latestAt), cash_entry_id: 'expense', before_state: JSON.stringify(second), after_state: JSON.stringify(current), reason: 'Corregir medio de pago' },
      ],
      issuer_settings: [{ id: crypto.randomUUID(), venue: 'calle30', legal_name: 'Gimnasio de prueba', tax_id: '20267565393', fiscal_address: 'Calle 30 número 100', tax_condition: 'monotributo', point_of_sale: 1, updated_at: stamp, actor: 'historic-owner', revision: 1 }],
    },
  };
}
function updateState(change, field, patch) {
  change[field] = JSON.stringify({ ...JSON.parse(change[field]), ...patch });
}

test('Version 7 preserves the complete manual correction history, signed income and fiscal issuer', () => {
  const backup = validateBackup(fixture());
  assert.equal(backup.records.cash_entries[0].amount, -1500);
  assert.equal(backup.records.cash_entries[0].revision, 3);
  assert.equal(backup.records.cash_entries[1].amount, 2500);
  assert.equal(backup.records.cash_entry_changes.length, 2);
  assert.equal(backup.records.cash_entry_changes[1].actor, 'historic-owner');
  assert.equal(backup.records.issuer_settings[0].tax_id, '20267565393');
  assert.equal(backup.records.issuer_settings[0].actor, 'historic-owner');
});

test('Versions 1 through 6 default to revision one and empty correction/fiscal histories', () => {
  for (let version = 1; version <= 6; version++) {
    const backup = fixture();
    backup.schemaVersion = version;
    backup.records.cash_entries = [backup.records.cash_entries[0]];
    delete backup.records.cash_entries[0].revision;
    delete backup.records.cash_entry_changes;
    delete backup.records.issuer_settings;
    const restored = validateBackup(backup);
    assert.equal(restored.records.cash_entries[0].revision, 1);
    assert.deepEqual(restored.records.cash_entry_changes, []);
    assert.deepEqual(restored.records.issuer_settings, []);
  }
});

test('Version 7 requires its correction and fiscal tables and current entry revisions', () => {
  for (const field of ['cash_entry_changes', 'issuer_settings']) {
    const backup = fixture();
    delete backup.records[field];
    assert.throws(() => validateBackup(backup), /versión 7/);
  }
  const backup = fixture();
  delete backup.records.cash_entries[0].revision;
  assert.throws(() => validateBackup(backup), /versión 7/);
});

test('Correction chains reject omitted versions, gaps and forks', () => {
  for (const position of [0, 1]) {
    const backup = fixture();
    backup.records.cash_entry_changes.splice(position, 1);
    assert.throws(() => validateBackup(backup), /incompleto/);
  }
  const gap = fixture();
  updateState(gap.records.cash_entry_changes[1], 'after_state', { revision: 4 });
  assert.throws(() => validateBackup(gap), /cadena/);
  const fork = fixture();
  updateState(fork.records.cash_entry_changes[1], 'before_state', { revision: 1 });
  updateState(fork.records.cash_entry_changes[1], 'after_state', { revision: 2 });
  assert.throws(() => validateBackup(fork), /cadena/);
});

test('Each correction starts from the previous complete state and ends at the current ledger state', () => {
  const brokenChain = fixture();
  updateState(brokenChain.records.cash_entry_changes[1], 'before_state', { amount: -1800 });
  assert.throws(() => validateBackup(brokenChain), /cadena/);
  for (const patch of [{ amount: -1800 }, { venue: 'pilates' }, { method: 'Tarjeta' }, { day: '2026-10-12' }, { concept: 'Otro concepto' }]) {
    const changedCurrent = fixture();
    Object.assign(changedCurrent.records.cash_entries[0], patch);
    assert.throws(() => validateBackup(changedCurrent), /última corrección/);
  }
});

test('Portable snapshots reject owner/record IDs, missing fields and mismatched movement kinds', () => {
  for (const patch of [{ owner: 'another-owner' }, { id: 'original-source-id' }, { product_id: 'product' }]) {
    const backup = fixture();
    updateState(backup.records.cash_entry_changes[0], 'before_state', patch);
    assert.throws(() => validateBackup(backup), /formato/);
  }
  const missing = fixture();
  const state = JSON.parse(missing.records.cash_entry_changes[0].before_state);
  delete state.method;
  missing.records.cash_entry_changes[0].before_state = JSON.stringify(state);
  assert.throws(() => validateBackup(missing), /formato/);
  const changedKind = fixture();
  updateState(changedKind.records.cash_entry_changes[1], 'after_state', { kind: 'income', category: 'Otros ingresos', amount: 1500 });
  assert.throws(() => validateBackup(changedKind), /cadena/);
});

test('Corrections require their source, a real reason and an operator; sales cannot be edited', () => {
  const missingSource = fixture();
  missingSource.records.cash_entry_changes[0].cash_entry_id = 'missing';
  assert.throws(() => validateBackup(missingSource), /Corrección/);
  for (const patch of [{ actor: '' }, { actor: '   ' }, { reason: '  ' }]) {
    const backup = fixture();
    Object.assign(backup.records.cash_entry_changes[0], patch);
    assert.throws(() => validateBackup(backup), /formato/);
  }
  const sale = fixture();
  sale.records.products = [{ ...common('product'), name: 'Bebida', category: 'Bebidas', price: 1500, active: 1, revision: 1 }];
  Object.assign(sale.records.cash_entries[0], { kind: 'sale', amount: 1500, product_id: 'product', quantity: 1 });
  assert.throws(() => validateBackup(sale), /venta o anulación/);
});

test('Correction timestamps cannot precede creation or follow annulment', () => {
  const early = fixture();
  early.records.cash_entry_changes[0].created_at = '2026-10-13T11:00:00.000Z';
  assert.throws(() => validateBackup(early), /cadena/);
  const annulled = fixture();
  annulled.records.cash_entries.push({ ...annulled.records.cash_entries[0], ...common('reversal', '2026-10-13T13:30:00.000Z'), kind: 'reversal', revision: 1, amount: 1500, reverses: 'expense' });
  assert.throws(() => validateBackup(annulled), /cadena/);
});

test('Fiscal records reject duplicate collecting branches, invalid CUIT and secrets', () => {
  const duplicate = fixture();
  duplicate.records.issuer_settings.push({ ...duplicate.records.issuer_settings[0], id: crypto.randomUUID() });
  assert.throws(() => validateBackup(duplicate), /duplicados/);
  for (const patch of [{ tax_id: '20267565394' }, { tax_id: '00000000000' }, { tax_id: '20-26756539-3' }, { point_of_sale: 0 }, { private_key: 'secret' }, { tax_condition: 'unknown' }]) {
    const backup = fixture();
    Object.assign(backup.records.issuer_settings[0], patch);
    assert.throws(() => validateBackup(backup), /formato/);
  }
});

test('Matching annulments of corrected expenses retain the current signed amount and collecting branch', () => {
  const backup = fixture();
  backup.records.cash_entries.push({ ...backup.records.cash_entries[0], ...common('reversal', '2026-10-13T14:30:00.000Z'), kind: 'reversal', revision: 1, amount: 1500, reverses: 'expense' });
  assert.equal(validateBackup(backup).records.cash_entries.filter(entry => entry.id !== 'income').reduce((sum, entry) => sum + entry.amount, 0), 0);
  backup.records.cash_entries[2].category = 'Otros';
  assert.throws(() => validateBackup(backup), /Anulación inconsistente/);
});
