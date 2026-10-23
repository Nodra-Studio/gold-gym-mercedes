import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url), folder = mkdtempSync(join(tmpdir(), 'gold-mfa-'));
const factor = 'e1000000-0000-4000-8000-000000000001', challenge = 'e2000000-0000-4000-8000-000000000001';
function compile(file, name, pairs = []) {
  let source = readFileSync(file, 'utf8');
  for (const [a,b] of pairs) source = source.replaceAll(a,b);
  writeFileSync(join(folder, name + '.mjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
}
writeFileSync(join(folder, 'mock.mjs'), `
export let config, calls;
export function state(input={}) { config={signedIn:true,confirmed:true,canonical:true,role:'owner',status:'active',factors:[],level:'aal1',allowed:true,...input};calls=[]; }
state();
export const authConfigured=()=>config.configured!==false;
export const ownerAccount=()=>config.canonical;
export const supportsSitesIdentity=false;
export const independentUserId=async()=>null;
export const getChatGPTUser=async()=>null;
export const allowAuthAttempt=async()=>config.allowed;
export const env={DB:{prepare(){return {bind(){return this},async first(){return config.role?{role:config.role,status:config.status}:null}}}}};
export const authClient=async()=>({auth:{
 getUser:async()=>({data:{user:config.signedIn?{id:'staff-user',email_confirmed_at:config.confirmed?'2026-10-14T00:00:00Z':null,factors:config.factors}:null},error:config.signedIn?null:{}}),
 mfa:{
  getAuthenticatorAssuranceLevel:async()=>({data:config.assuranceError?null:{currentLevel:config.level,nextLevel:'aal2'},error:config.assuranceError?{}:null}),
  enroll:async input=>{calls.push(['enroll',input]);return {data:{id:'${factor}',totp:{qr_code:'<svg></svg>',secret:'TESTSEED'}},error:null}},
  challenge:async input=>{calls.push(['challenge',input]);return {data:{id:'${challenge}',expires_at:1234},error:null}},
  verify:async input=>{calls.push(['verify',input]);return {data:{},error:config.badCode?{}:null}},
  unenroll:async input=>{calls.push(['remove',input]);return {data:{},error:null}}
 }}});
`);
compile('lib/auth/return-to.ts', 'return-to');
compile('lib/auth/config.ts', 'config', [["'./return-to'", "'./return-to.mjs'"]]);
compile('lib/auth/mfa.ts', 'mfa', [["'./return-to'", "'./return-to.mjs'"]]);
compile('lib/staff-scope.ts','staff-scope',[]);
compile('lib/server.ts', 'server', [['@/lib/staff-scope','./staff-scope.mjs'],['@club/runtime','./mock.mjs'],['@/app/chatgpt-auth','./mock.mjs']]);
compile('app/api/mfa/route.ts', 'route', [["'zod'", JSON.stringify(pathToFileURL(require.resolve('zod')).href)], ['@/lib/auth/client','./mock.mjs'],['@/lib/auth/config','./mock.mjs'],['@/lib/auth/rate-limit','./mock.mjs'],['@/lib/auth/mfa','./mfa.mjs'],['@/lib/server','./server.mjs']]);
const mock = await import(pathToFileURL(join(folder, 'mock.mjs'))), api = await import(pathToFileURL(join(folder, 'route.mjs'))), helpers = await import(pathToFileURL(join(folder, 'mfa.mjs')));
const originalFlag = process.env.GOLD_GYM_SMS_MFA_ENABLED;
delete process.env.GOLD_GYM_SMS_MFA_ENABLED;
const verified = {id:factor, factor_type:'totp',status:'verified'};
async function call(input, origin='https://club.test') {
  const response = await api.POST(new Request('https://club.test/api/mfa', {method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(input)}));
  return {status:response.status, cache:response.headers.get('cache-control'),...await response.json()};
}
try {
  await test('MFA setup and verification preserve authenticated factor ownership', async t => {
    await t.test('Only confirmed accounts with active administrative roles enroll', async () => {
      for (const state of [{signedIn:false},{confirmed:false},{canonical:false,role:'player'},{canonical:false,role:'owner',status:'revoked'},{canonical:false,role:null}]) {
        mock.state(state); assert.ok([401,403].includes((await call({action:'enroll',factorType:'totp'})).status)); assert.deepEqual(mock.calls,[]);
      }
      for (const role of ['owner','reception','gate']) {mock.state({canonical:false,role}); assert.equal((await call({action:'enroll',factorType:'totp'})).status,200);}
    });
    await t.test('Authenticator setup is default and SMS cannot activate without configuration', async () => {
      mock.state(); const result=await call({action:'enroll'});assert.equal(result.status,200);assert.equal(result.totpSetup.secret,'TESTSEED');assert.equal(mock.calls[0][1].factorType,'totp');assert.match(result.cache,/no-store/);
      mock.state();assert.equal((await call({action:'enroll',factorType:'phone',phone:'+5492324123456'})).status,503);assert.deepEqual(mock.calls,[]);
    });
    await t.test('Cross-origin, absent origin and throttled requests never reach the provider', async () => {
      for (const origin of [null,'https://other.test']) {mock.state();assert.equal((await call({action:'enroll'},origin)).status,403);assert.deepEqual(mock.calls,[]);}
      mock.state({allowed:false});assert.equal((await call({action:'enroll'})).status,429);assert.deepEqual(mock.calls,[]);
    });
    await t.test('A factor from another user cannot be challenged, verified or removed', async () => {
      for (const action of ['challenge','verify','remove']) {mock.state();assert.equal((await call({action,factorId:factor,...(action==='verify'?{challengeId:challenge,code:'123456'}:{})})).status,404);assert.deepEqual(mock.calls,[]);}
    });
    await t.test('Existing MFA cannot be bypassed with a pending factor or new enrollment', async () => {
      mock.state({factors:[verified,{...verified,id:challenge,status:'unverified'}]});
      assert.equal((await call({action:'enroll'})).status,403);
      assert.equal((await call({action:'challenge',factorId:challenge})).status,403);
      assert.equal((await call({action:'verify',factorId:challenge,challengeId:challenge,code:'123456'})).status,403);
      assert.equal((await call({action:'remove',factorId:factor})).status,403);assert.deepEqual(mock.calls,[]);
      assert.equal((await call({action:'challenge',factorId:factor})).status,200);
      assert.deepEqual(mock.calls[0],['challenge',{factorId:factor}]);
    });
    await t.test('Provider verification errors retain no success and elevated sessions can remove a factor', async () => {
      mock.state({factors:[verified],badCode:true}); assert.equal((await call({action:'verify',factorId:factor,challengeId:challenge,code:'123456'})).status,400);
      mock.state({factors:[verified]}); assert.equal((await call({action:'verify',factorId:factor,challengeId:challenge,code:'123456'})).verified,true);
      mock.state({factors:[verified],level:'aal2'});assert.equal((await call({action:'remove',factorId:factor})).removed,true);
    });
    await t.test('Security status never exposes the authenticator seed and rejects service uncertainty', async () => {
      mock.state({factors:[verified]});const response=await api.GET(), json=await response.json();assert.equal(json.requiresVerification,true);assert.equal(json.smsEnrollmentEnabled,false);assert.doesNotMatch(JSON.stringify(json),/secret|TESTSEED|qr_code/);
      mock.state({factors:[verified],assuranceError:true});assert.equal((await api.GET()).status,503);
    });
    await t.test('Return destinations are safe and cannot loop through verification or an API', () => {
      for (const input of ['/api/cash','/verificar?next=/verificar']) assert.equal(helpers.mfaReturnTo(input),'/portal');
      for (const input of ['//evil.test','https://evil.test','/\\evil.test']) assert.equal(helpers.mfaReturnTo(input),'/gestion');
      assert.equal(helpers.mfaReturnTo('/ingreso?venue=pilates'),'/ingreso?venue=pilates');
    });
  });
} finally {
  if(originalFlag===undefined) delete process.env.GOLD_GYM_SMS_MFA_ENABLED; else process.env.GOLD_GYM_SMS_MFA_ENABLED=originalFlag;
  rmSync(folder,{recursive:true,force:true});
}
