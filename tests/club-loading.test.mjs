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

// Render the membership form with persistent hook state and invoke its handlers.
const membershipSource = readFileSync('components/member-memberships.tsx', 'utf8');
const membershipCompiled = ts.transpileModule(
  membershipSource.slice(membershipSource.indexOf('export default function')).replace('export default function', 'function'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } },
).outputText;
function setupMembershipForm() {
  const state = [];
  let index = 0, submitted;
  const useState = initial => {
    const current = index++;
    if (!(current in state)) state[current] = typeof initial === 'function' ? initial() : initial;
    return [state[current], value => { state[current] = value; }];
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const MemberMemberships = new Function('useState', 'React', 'dateLabel', 'money', membershipCompiled + '\nreturn MemberMemberships;')(
    useState, React, value => value, value => String(value),
  );
  const member = { id: 'member', plan_id: 'gym', name: 'Ana', plan_name: 'Gym', expires: '2026-11-01', status: 'active' };
  const data = {
    today: '2026-10-13',
    plans: [{ id: 'gym' }, { id: 'pilates' }, { id: 'all' }],
    memberships: [{ id: 'extra', member_id: member.id, plan_id: 'pilates', expires: '2026-11-01', status: 'active' }],
  };
  return {
    data,
    render() {
      index = 0;
      return MemberMemberships({ member, data, busy: false, submit: payload => { submitted = payload; } });
    },
    submit(form) {
      form.props.onSubmit({ preventDefault() {} });
      return submitted;
    },
  };
}
function formElements(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.props?.children ?? []).flat(Infinity).flatMap(formElements)];
}

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

test('Membership edits retain their original version across refreshed props and reset on selection', () => {
  const form = setupMembershipForm();
  let tree = form.render();
  formElements(tree).find(node => node.type === 'select').props.onChange({ target: { value: 'extra' } });
  tree = form.render();
  formElements(tree).find(node => node.type === 'input').props.onChange({ target: { value: '2026-11-05' } });
  formElements(tree).filter(node => node.type === 'select')[1].props.onChange({ target: { value: 'paused' } });

  // Another reception renews or pauses the membership while this form is open.
  form.data.memberships[0] = { ...form.data.memberships[0], expires: '2026-12-01', status: 'paused' };
  tree = form.render();
  assert.deepEqual(form.submit(tree), {
    action: 'membership', memberId: 'member', planId: 'pilates',
    expires: '2026-11-05', status: 'paused', id: 'extra',
    expectedExpires: '2026-11-01', expectedStatus: 'active',
  });

  formElements(tree).find(node => node.type === 'select').props.onChange({ target: { value: '' } });
  tree = form.render();
  assert.deepEqual(form.submit(tree), {
    action: 'membership', memberId: 'member', planId: 'all', expires: form.data.today, status: 'active',
  });

  formElements(tree).find(node => node.type === 'select').props.onChange({ target: { value: 'extra' } });
  tree = form.render();
  assert.deepEqual(form.submit(tree), {
    action: 'membership', memberId: 'member', planId: 'pilates',
    expires: '2026-12-01', status: 'paused', id: 'extra',
    expectedExpires: '2026-12-01', expectedStatus: 'paused',
  });
});

test('An open booking detail follows externally recorded payments and cancellations', () => {
  const agendaSource = readFileSync('components/padel-agenda.tsx', 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default function', 'function');
  const agendaCompiled = ts.transpileModule(agendaSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const state = [];
  let index = 0;
  const data = { bookings: [{ id: 'booking', day: '2026-10-13', start: 480, court: 1,
    status: 'confirmed', kind: 'booking', name: 'Cliente', phone: '', amount: 24000, deposit: 6000 }] };
  const dependencies = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: initial => {
      const current = index++;
      if (!(current in state)) state[current] = typeof initial === 'function' ? initial() : initial;
      return [state[current], value => { state[current] = value; }];
    },
    useClub: () => ({ data, busy: false, loading: false, error: '', refresh() {}, mutate() {}, setError() {} }),
    localDay: () => '2026-10-13', addDays: value => value, dateLabel: value => value,
    money: value => String(value) + ' ARS', timeLabel: value => String(value), slotPassed: () => false, slots: [480],
    ...Object.fromEntries(['Link', 'PadelRequests', 'BookingPaymentHistory', 'WorkspaceHeader', 'ErrorNotice', 'Loading', 'FormModal',
      'Field', 'SelectField', 'Option', 'SaveButton', 'ChevronLeft', 'ChevronRight', 'RefreshCw', 'Plus', 'CalendarDays', 'ArrowUpRight']
      .map(name => [name, name])),
  };
  const Component = new Function(...Object.keys(dependencies), agendaCompiled + '\nreturn PadelAgenda;')(...Object.values(dependencies));
  const render = () => { index = 0; return Component(); };
  const text = node => typeof node === 'string' || typeof node === 'number'
    ? String(node) : (node?.props?.children ?? []).flat(Infinity).map(text).join('');
  const find = (tree, predicate) => formElements(tree).find(predicate);
  let tree = render();
  find(tree, node => node.type === 'button' && text(node).includes('Ver reserva')).props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.type === 'BookingPaymentHistory').props.totalPaid, 6000);
  find(tree, node => node.type === 'button' && text(node) === 'Cancelar reserva').props.onClick();
  data.bookings[0] = { ...data.bookings[0], deposit: 12000 };
  tree = render();
  const detail = find(tree, node => node.type === 'FormModal' && node.props.open);
  assert.match(text(detail), /Pagado: 12000 ARS.*Pendiente: 12000 ARS/);
  assert.match(text(detail), /Hay 12000 ARS cobrados/);
  assert.equal(find(detail, node => node.type === 'BookingPaymentHistory').props.totalPaid, 12000);
  data.bookings[0] = { ...data.bookings[0], status: 'cancelled' };
  tree = render();
  const cancelled = find(tree, node => node.type === 'FormModal' && node.props.open);
  assert.match(text(cancelled), /Esta reserva fue cancelada/);
  assert.equal(find(cancelled, node => node.type === 'button' && text(node) === 'Cancelar reserva').props.disabled, true);
  assert.equal(find(cancelled, node => node.props['aria-label'] === 'Confirmación de cancelación'), undefined);
});
