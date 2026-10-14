import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const club = await import('data:text/javascript;base64,' + Buffer.from(compile(readFileSync('lib/club.ts','utf8'))).toString('base64'));
const source = compile(readFileSync('lib/terminal-offline.ts','utf8').replace(/^import .*;\n/m,'')).replaceAll('export ', '');
function setup({ lockEnabled=true, digest=crypto.subtle.digest.bind(crypto.subtle) }={}) {
  const values=new Map(), messages=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let tail=Promise.resolve();
  const locks={request(_name,work){const result=tail.then(work);tail=result.catch(()=>undefined);return result;}};
  const browser={...(lockEnabled?{locks}:{})}, window={dispatchEvent:event=>messages.push(event.type)};
  const factory=new Function('localStorage','navigator','window','crypto','caches','accessForMemberships','localDay','requestId',source+'\nreturn {recordOfflineLookup,clearTerminalOffline,snapshotUsable};');
  const api=factory(storage,browser,window,{subtle:{digest}},{},club.accessForMemberships,club.localDay,()=>crypto.randomUUID());
  const now=Date.now();
  const snapshot={id:crypto.randomUUID(),deviceId:crypto.randomUUID(),preparedBy:'old-user',venue:'Calle 30',preparedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),salt:'test-salt',entries:[]};
  storage.setItem('gold-terminal-offline-v1',JSON.stringify({version:1,deviceId:snapshot.deviceId,snapshot,events:[],lastSeenAt:new Date(now).toISOString()}));
  storage.setItem('gold-terminal-venue','Calle 30');
  return {api,storage,messages,snapshot};
}
await test('Logging out during a pending offline lookup cannot restore the previous account copy',async()=>{
  let begin, release;
  const started=new Promise(resolve=>{begin=resolve;}), waiting=new Promise(resolve=>{release=resolve;});
  const {api,storage,messages}=setup({digest:async(...args)=>{begin();await waiting;return crypto.subtle.digest(...args);}});
  const lookup=api.recordOfflineLookup('Calle 30','99000001');
  await started;
  const cleared=api.clearTerminalOffline();
  assert.notEqual(storage.getItem('gold-terminal-offline-v1'),null);
  release();await lookup;await cleared;
  assert.equal(storage.getItem('gold-terminal-offline-v1'),null);
  assert.equal(storage.getItem('gold-terminal-venue'),null);
  assert.deepEqual(messages,['gold-terminal-cleared']);
  await assert.rejects(api.recordOfflineLookup('Calle 30','99000001'),/copia offline venció/i);
});
await test('Clearing an old copy also works in browsers without offline locking support',async()=>{
  const {api,storage}=setup({lockEnabled:false});
  await assert.rejects(api.recordOfflineLookup('Calle 30','99000001'),/no permite guardar/i);
  await api.clearTerminalOffline();
  assert.equal(storage.getItem('gold-terminal-offline-v1'),null);
});
await test('A terminal copy cannot authorize another venue, an expired window or a clock rollback',()=>{
  const {api,snapshot}=setup();const now=new Date();
  assert.equal(api.snapshotUsable(snapshot,'Calle 30',now),true);
  assert.equal(api.snapshotUsable(snapshot,'Pilates',now),false);
  assert.equal(api.snapshotUsable(snapshot,'Calle 30',new Date(snapshot.expiresAt)),false);
  assert.equal(api.snapshotUsable(snapshot,'Calle 30',now,new Date(now.getTime()+120000).toISOString()),false);
});
