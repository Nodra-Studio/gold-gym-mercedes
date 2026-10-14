import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    jsx: ts.JsxEmit.React,
  },
}).outputText;
const load = async path => import('data:text/javascript;base64,' + Buffer.from(compile(readFileSync(path, 'utf8'))).toString('base64'));
const club = await load('lib/club.ts');
const validation = await load('lib/public-padel-validation.ts');
const source = readFileSync('components/public-padel.tsx', 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default function', 'function');
const compiled = compile(source);

// Drive the real component's events and request effects with controlled replies.
// No network, database, browser clock, or hard-coded hook positions are needed.
function setup() {
  const states = [], refs = [], effects = [], scheduled = [], requests = [];
  const timers = new Set();
  let stateIndex = 0, refIndex = 0, effectIndex = 0, tree, expired = false;
  const day = club.addDays(club.localDay(), 1);
  class Input {
    constructor(value = '') { this.value = value; this.validityMessage = ''; this.reported = false; }
    setCustomValidity(message) { this.validityMessage = message; }
    reportValidity() { this.reported = true; }
  }
  const phoneInput = new Input();
  const useState = initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  const useRef = initial => refs[refIndex++] ??= { current: initial };
  const useEffect = (effect, deps) => {
    const index = effectIndex++, previous = effects[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      scheduled.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      });
    }
  };
  const icons = ['ArrowLeft', 'ArrowRight', 'CalendarDays', 'Check', 'CheckCircle2', 'ChevronRight', 'Clock3', 'CloudRain', 'MapPin', 'RefreshCw', 'ShieldCheck', 'BrandIcon'];
  const dependencies = {
    ...club,
    ...validation,
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useState, useRef, useEffect,
    apiFetch: (url, init = {}) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })),
    localDay: () => day,
    slotPassed: () => expired,
    brand: { contact: 'https://example.test' },
    venues: [{ name: 'Club Unión', map: 'https://example.test', address: 'Club de prueba' }],
    s: {},
    HTMLInputElement: Input,
    FormData: class { get() { return ''; } },
    window: {
      setInterval: callback => { timers.add(callback); return callback; },
      clearInterval: callback => timers.delete(callback),
    },
    clearInterval: callback => timers.delete(callback),
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    ...Object.fromEntries(icons.map(name => [name, name])),
  };
  const Component = new Function(...Object.keys(dependencies), compiled + '\nreturn PublicPadel;')(...Object.values(dependencies));
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    tree = Component();
    while (scheduled.length) scheduled.shift()();
    return tree;
  };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); return render(); };
  const find = predicate => search(tree, predicate);
  const input = name => find(node => node.type === 'input' && node.props.name === name);
  const change = (name, value) => {
    const target = name === 'phone' ? phoneInput : new Input();
    target.value = value;
    input(name).props.onChange({ target });
    render();
  };
  const submit = () => find(node => node.type === 'form').props.onSubmit({
    preventDefault() {}, currentTarget: { elements: { namedItem: () => phoneInput } },
  });
  const availability = {
    day, today: day, occupied: [],
    settings: { padel_price: 24000, booking_days: 30, cancel_hours: 24, deposit_percent: 50, payment_alias: 'gold.original', whatsapp: '', revision: 1 },
  };
  const replyAvailability = async (overrides = {}) => {
    const request = requests.filter(item => item.url.startsWith('/api/public-padel?')).at(-1);
    request.resolve(reply({ ...availability, ...overrides }));
    await settle();
  };
  render();
  return {
    render, settle, find, change, submit, replyAvailability, phoneInput, availability,
    writes: () => requests.filter(request => request.init.method === 'POST'),
    tick: () => { for (const callback of timers) callback(); render(); },
    expire: () => { expired = true; },
  };
}
function search(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of (node.children ?? []).flat()) {
    const found = search(child, predicate);
    if (found) return found;
  }
  return null;
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node?.children ?? []).flat().map(textContent).join('');
}
const reply = (data, ok = true) => ({ ok, json: async () => data });
const success = { id: '7356a27b-38b4-4539-b26a-0c8c9ad4e11b', amount: 24000, deposit_expected: 12000 };
async function checkout() {
  const form = setup();
  await form.replyAvailability();
  form.find(node => node.type === 'button' && textContent(node).startsWith('08:00')).props.onClick();
  form.render();
  form.find(node => node.type === 'button' && textContent(node) === 'Continuar').props.onClick();
  form.render();
  form.change('name', ' Cliente de prueba ');
  form.change('phone', '+54 (9) 2324-123456');
  return form;
}

test('A lost response can be recovered after reception occupies the slot, preserving the original payload', async () => {
  const form = await checkout();
  const send = form.submit();
  await form.submit();
  assert.equal(form.writes().length, 1, 'A concurrent submit does not write twice');
  const original = form.writes()[0].init.body;
  form.writes()[0].reject(new Error('Se perdió la respuesta.'));
  await send;
  form.render();
  assert.equal(form.find(node => node.type === 'fieldset').props.disabled, true);
  assert.equal(form.find(node => node.type === 'input' && node.props.type === 'file').props.disabled, true);
  assert.equal(form.find(node => node.type === 'button' && textContent(node).includes('Cambiar día')).props.disabled, true);
  form.tick();
  assert.equal(form.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  await form.replyAvailability({
    occupied: [{ court: 1, start: 480 }],
    settings: { ...form.availability.settings, padel_price: 36000, deposit_percent: 25, payment_alias: 'gold.nuevo', revision: 2 },
  });
  assert.equal(
    textContent(form.find(node => node.type === 'dl')),
    `Total del turno${club.money(24000)}Seña para confirmar${club.money(12000)}Saldo en el club${club.money(12000)}`,
    'The checkout keeps the submitted amount and deposit after an availability refresh',
  );
  assert.equal(
    textContent(form.find(node => node.type === 'p' && textContent(node).startsWith('Alias / CBU:'))),
    'Alias / CBU: gold.original',
    'The payment alias remains part of the original quote while its submission is uncertain',
  );
  const retryButton = form.find(node => node.type === 'button' && node.props.type === 'submit');
  assert.equal(retryButton.props.disabled, false);
  assert.equal(textContent(retryButton), 'Reintentar mi solicitud');
  const retry = form.submit();
  assert.equal(form.writes()[1].init.body, original, 'The retry also preserves the original price, revision, phone and request key');
  form.writes()[1].resolve(reply({ ...success, replayed: true }));
  await retry;
  assert.match(textContent(form.render()), /SOLICITUD RECIBIDA.*#7356A27B/);
});

test('A definitive retry rejection releases the old quote and uses refreshed payment settings on the next submission', async () => {
  const form = await checkout();
  const send = form.submit();
  const original = JSON.parse(form.writes()[0].init.body);
  form.writes()[0].reject(new Error('Se perdió la respuesta.'));
  await send;
  form.tick();
  await form.replyAvailability({
    settings: { ...form.availability.settings, padel_price: 36000, deposit_percent: 25, payment_alias: 'gold.nuevo', revision: 2 },
  });
  const retry = form.submit();
  form.writes()[1].resolve(reply({ error: 'La tarifa cambió. Actualizá los horarios antes de enviar.' }, false));
  await retry;
  form.render();
  assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false);
  assert.equal(
    textContent(form.find(node => node.type === 'dl')),
    `Total del turno${club.money(36000)}Seña para confirmar${club.money(9000)}Saldo en el club${club.money(27000)}`,
  );
  assert.equal(
    textContent(form.find(node => node.type === 'p' && textContent(node).startsWith('Alias / CBU:'))),
    'Alias / CBU: gold.nuevo',
  );
  const next = form.submit();
  const updated = JSON.parse(form.writes()[2].init.body);
  assert.notEqual(updated.requestKey, original.requestKey);
  assert.equal(updated.expectedPrice, 36000);
  assert.equal(updated.expectedRevision, 2);
  form.writes()[2].resolve(reply({ ...success, amount: 36000, deposit_expected: 9000 }));
  await next;
});

test('A lost response can still be recovered once the original start time passes', async () => {
  const form = await checkout();
  const send = form.submit();
  const original = form.writes()[0].init.body;
  form.writes()[0].reject(new Error('Se perdió la respuesta.'));
  await send;
  form.expire();
  form.tick();
  await form.replyAvailability();
  assert.equal(form.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  const retry = form.submit();
  assert.equal(form.writes()[1].init.body, original);
  form.writes()[1].resolve(reply({ ...success, replayed: true }));
  await retry;
  assert.match(textContent(form.render()), /SOLICITUD RECIBIDA/);
});

test('A definitive rejection permits corrected details and a new request key', async () => {
  const form = await checkout();
  const send = form.submit();
  const original = JSON.parse(form.writes()[0].init.body);
  form.writes()[0].resolve(reply({ error: 'Revisá el teléfono.' }, false));
  await send;
  form.render();
  assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false);
  form.change('phone', '5492324111111');
  const next = form.submit();
  const corrected = JSON.parse(form.writes()[1].init.body);
  assert.notEqual(corrected.requestKey, original.requestKey);
  assert.equal(corrected.phone, '5492324111111');
  assert.equal(corrected.name, 'Cliente de prueba');
  form.writes()[1].resolve(reply(success));
  await next;
});

test('The form validates digits after removing phone formatting and reports the specific field', async () => {
  const form = await checkout();
  form.change('phone', '1234  56');
  assert.equal(form.phoneInput.validityMessage, validation.publicPhoneMessage);
  await form.submit();
  assert.equal(form.writes().length, 0);
  assert.equal(form.phoneInput.reported, true);
  form.change('phone', '+54 (9) 2324-123456');
  assert.equal(form.phoneInput.validityMessage, '');
  const send = form.submit();
  assert.equal(JSON.parse(form.writes()[0].init.body).phone, '+5492324123456');
  form.writes()[0].resolve(reply(success));
  await send;
});
