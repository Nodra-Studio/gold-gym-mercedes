import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the hook's request lifecycle with controlled, out-of-order replies.
const source = readFileSync('components/club-client.tsx', 'utf8');
const hook = source.slice(source.indexOf('export function useClub('), source.indexOf('export function WorkspaceHeader'));
const compiled = ts.transpileModule(hook.replace('export function', 'function'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
function setup() {
  const state = [], effects = [], requests = [];
  const apiFetch = (url, init) => new Promise((resolve, reject) => requests.push({ init, resolve, reject }));
  const useState = initial => {
    const index = state.push(initial) - 1;
    return [initial, value => { state[index] = value; }];
  };
  const useClub = new Function('useState', 'useRef', 'useCallback', 'useEffect', 'apiFetch', compiled + '\nreturn useClub;')(
    useState, value => ({ current: value }), callback => callback, effect => effects.push(effect), apiFetch,
  );
  const club = useClub();
  return { club, state, effects, requests };
}
const reply = value => ({ ok: true, json: async () => value });

test('An older response cannot replace the latest club data', async () => {
  const { club, state, requests } = setup();
  const first = club.refresh();
  const second = club.refresh();
  assert.equal(requests[0].init.signal.aborted, true);
  requests[1].resolve(reply({ version: 2 }));
  await second;
  requests[0].resolve(reply({ version: 1 }));
  await first;
  assert.deepEqual(state[0], { version: 2 });
  assert.equal(state[2], false);
});

test('A failed refresh preserves existing data and a successful retry clears its error', async () => {
  const { club, state, requests } = setup();
  let pending = club.refresh();
  requests[0].resolve(reply({ version: 1 }));
  await pending;
  pending = club.refresh();
  requests[1].reject(new Error('Sin conexión'));
  await pending;
  assert.deepEqual(state[0], { version: 1 });
  assert.equal(state[1], 'Sin conexión');
  pending = club.refresh();
  requests[2].resolve(reply({ version: 2 }));
  await pending;
  assert.equal(state[1], '');
});

test('Saving invalidates older reads and rejects a duplicate concurrent submission', async () => {
  const { club, state, requests } = setup();
  const oldRead = club.refresh();
  const save = club.mutate({ action: 'test' });
  await assert.rejects(club.mutate({ action: 'test' }), /operación en curso/);
  assert.equal(requests.length, 2);
  requests[0].resolve(reply({ version: 1 }));
  await oldRead;
  assert.equal(state[0], null);
  requests[1].resolve(reply({ ok: true }));
  await new Promise(resolve => setImmediate(resolve));
  requests[2].resolve(reply({ version: 2 }));
  await save;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state[0], { version: 2 });
  assert.equal(state[3], false);
});

test('Unmount cancels reads and prevents a late response from updating data', async () => {
  const { effects, requests, state } = setup();
  const cleanup = effects[0]();
  cleanup();
  assert.equal(requests[0].init.signal.aborted, true);
  requests[0].resolve(reply({ version: 1 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[0], null);
});

 test('A confirmed save resolves before its refresh and keeps duplicate writes locked', async () => {
  const { club, state, requests } = setup();
  const save = club.mutate({action:'payment'});
  requests[0].resolve(reply({ok:true}));
  await save;
  assert.equal(requests.length,2);
  assert.equal(state[2],false);
  assert.equal(state[3],true);
  await club.refresh();
  assert.equal(requests.length,2);
  await assert.rejects(club.mutate({action:'payment'}), /operación en curso/);
  requests[1].reject(new Error('Sin conexión'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[3],false);
  assert.match(state[1],/quedó guardado.*No repitas/);
 });
