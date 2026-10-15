import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function compile(file) {
  return ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React },
  }).outputText.replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export default function ', 'function ');
}
function hooks() {
  const slots = [], effects = [];
  let index = 0;
  return {
    slots, effects,
    reset() { index = 0; },
    useState(initial) {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef(initial) {
      const key = index++;
      return slots[key] ??= { current: initial };
    },
    useEffect(effect) { effects.push(effect); },
    useCallback(callback) { return callback; },
  };
}
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
function elements(tree) {
  return !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children ?? []).flat(Infinity).flatMap(elements)];
}
function planForm(component, initial) {
  const state = hooks();
  const editors = new Function('useState', 'useRef', 'React', 'LockKeyhole', 'planPresets', compile('components/plan-editor.tsx') + '\nreturn {CreatePlanEditor, ExistingPlanEditor, PadelEditor};')(
    state.useState, state.useRef, React, () => null, [{id:'gym-member',name:'Musculación · socios',scope:'gym'}],
  );
  const props = { ...initial };
  return {
    props,
    render() { state.reset(); return editors[component](props); },
    field(name, value) {
      elements(this.render()).find(node => node.type === 'input' && node.props.name === name).props.onChange({target:{value}});
    },
    submit() { return this.render().props.onSubmit({ preventDefault() {} }); },
  };
}
const plan = {id:'gym',name:'Musculación',days:30,price:100,published:0,access_scope:'gym'};
const padel = {padel_price:200,deposit_percent:30,payment_alias:'club.alias',whatsapp:'5492324123456',revision:2};
const data = {role:'owner',plans:[plan],padel};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Creating a plan keeps one request and one payload across double clicks and uncertain replies', async () => {
  const calls = [], pending = [], created = [];
  const form = planForm('CreatePlanEditor', {busy:false,save:payload => { calls.push(payload); return new Promise(resolve => pending.push(resolve)); },onCreated:id => created.push(id),onCancel(){}});
  assert.equal(elements(form.render()).find(node => node.type === 'input' && node.props.name === 'price').props.value, '');
  form.field('name','Pilates socios'); form.field('price','25000');
  const first = form.submit();
  await form.submit();
  assert.equal(calls.length,1);
  assert.match(calls[0].requestKey,/^[a-f0-9-]{36}$/);
  pending[0]({ok:false,uncertain:true}); await first;
  assert.equal(elements(form.render()).find(node => node.type === 'fieldset').props.disabled,true);
  const retry = form.submit();
  assert.strictEqual(calls[1],calls[0]);
  assert.equal(calls[1].price,25000);
  pending[1]({ok:true,data,createdId:'new-plan'}); await retry;
  assert.deepEqual(created,['new-plan']);
});

test('A rejected create preserves its draft and permits a corrected request with a new key', async () => {
  const calls = [];
  const form = planForm('CreatePlanEditor', {busy:false,save:async payload => {calls.push(payload);return {ok:false,uncertain:false};},onCreated(){},onCancel(){}});
  form.field('name','Plan nuevo'); form.field('price','0');
  await form.submit();
  assert.equal(elements(form.render()).find(node => node.type === 'fieldset').props.disabled,false);
  assert.equal(elements(form.render()).find(node => node.type === 'input' && node.props.name === 'name').props.value,'Plan nuevo');
  form.field('price','30000'); await form.submit();
  assert.equal(calls[0].price,0); assert.equal(calls[1].price,30000); assert.notEqual(calls[0].requestKey,calls[1].requestKey);
});

test('Another plan refresh cannot overwrite a local draft or advance its expected version', async () => {
  const calls = [];
  const form = planForm('ExistingPlanEditor', {plan,owner:true,busy:false,save:async payload => {calls.push(payload);return {ok:false,uncertain:false};}});
  form.field('price','35000');
  form.props.plan = {...plan,price:27000,name:'Musculación editada',days:40};
  await form.submit();
  assert.equal(calls[0].price,35000); assert.equal(calls[0].expectedPrice,100); assert.equal(calls[0].expectedName,'Musculación'); assert.equal(calls[0].expectedDays,30);
  elements(form.render()).find(node => node.type === 'button' && node.props.className === 'tariff-text-button').props.onClick();
  await form.submit();
  assert.equal(calls[1].price,27000); assert.equal(calls[1].expectedName,'Musculación editada'); assert.equal(calls[1].expectedDays,40);
});

test('Reception sees restricted fields and sends only permitted changes for plans and padel', async () => {
  const calls = [];
  const form = planForm('ExistingPlanEditor', {plan,owner:false,busy:false,save:async payload => {calls.push(payload);return {ok:false,uncertain:false};}});
  const fields = elements(form.render());
  for (const name of ['name','days','scope']) assert.equal(fields.find(node => ['input','select'].includes(node.type) && node.props.name === name).props.disabled,true);
  assert.notEqual(fields.find(node => node.type === 'input' && node.props.name === 'price').props.disabled,true);
  await form.submit();
  assert.equal(calls[0].name,undefined); assert.equal(calls[0].days,undefined); assert.equal(calls[0].accessScope,plan.access_scope);
  const court = planForm('PadelEditor', {padel,owner:false,busy:false,save:async payload => {calls.push(payload);return {ok:false,uncertain:false};}});
  court.field('price','1000'); await court.submit();
  assert.equal(calls[1].price,1000); assert.equal(calls[1].alias,padel.payment_alias); assert.equal(calls[1].whatsapp,padel.whatsapp);
  for (const name of ['alias','whatsapp']) assert.equal(elements(court.render()).find(node => node.type === 'input' && node.props.name === name).props.disabled,true);
});

function tariffHook() {
  const state = hooks(), requests = [];
  const apiFetch = (url,init) => new Promise((resolve,reject) => requests.push({url,init,resolve,reject}));
  class ApiError extends Error {}
  // Only the data lifecycle hook is exercised, without rendering the workspace.
  const source = compile('components/tariffs-client.tsx').split('function Tariffs()')[0];
  const mount = new Function('useState','useRef','useEffect','useCallback','apiFetch','ApiError',source+'\nreturn useTariffs;')(state.useState,state.useRef,state.useEffect,state.useCallback,apiFetch,ApiError);
  return {state,requests,hook:mount()};
}
const reply = payload => ({ok:true,status:200,json:async()=>payload});

test('An older tariff read cannot replace fresh results and unmount aborts requests', async () => {
  const {state,requests,hook} = tariffHook();
  const a = hook.load(), b = hook.load();
  assert.equal(requests[0].init.signal.aborted,true);
  requests[1].resolve(reply(data)); await b;
  requests[0].resolve(reply({...data,plans:[]})); await a;
  assert.deepEqual(state.slots[0],data);
  const cleanup = state.effects[0]();
  await flush();
  assert.equal(requests.length,3);
  cleanup(); assert.equal(requests[2].init.signal.aborted,true);
  requests[2].resolve(reply({...data,plans:[]})); await flush();
  assert.deepEqual(state.slots[0],data);
});

test('Saving invalidates stale reads and releases the form only after confirmed fresh data', async () => {
  const {state,requests,hook} = tariffHook();
  const old = hook.load();
  const saving = hook.save({kind:'createPlan'});
  const duplicate = await hook.save({kind:'createPlan'});
  assert.equal(duplicate.ok,false); assert.equal(requests.length,2); assert.equal(requests[0].init.signal.aborted,true);
  requests[0].resolve(reply({...data,plans:[]})); await old;
  assert.equal(state.slots[0],null);
  requests[1].resolve(reply({ok:true,id:'new-plan'})); await flush();
  assert.equal(requests.length,3); assert.equal(state.slots[2],true);
  requests[2].resolve(reply(data));
  const outcome = await saving;
  assert.equal(outcome.ok,true); assert.equal(outcome.createdId,'new-plan'); assert.equal(state.slots[2],false);
});

test('A confirmed create followed by a failed refresh retains its retry instead of resetting', async () => {
  const {requests,hook} = tariffHook();
  const saving = hook.save({kind:'createPlan'});
  requests[0].resolve(reply({ok:true,id:'new-plan'})); await flush();
  requests[1].reject(new Error('Sin conexión'));
  assert.deepEqual(await saving,{ok:false,uncertain:true});
});
