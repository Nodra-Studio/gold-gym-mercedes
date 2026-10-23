import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const dir=mkdtempSync(join(tmpdir(),'gold-staff-scopes-')),require=createRequire(import.meta.url);
function compile(file,name){
  let source=readFileSync(file,'utf8');
  for(const [from,to] of [['@club/runtime','./runtime.mjs'],['@/app/chatgpt-auth','./runtime.mjs'],['@/lib/server','./server.mjs'],['@/lib/staff-scope','./scope.mjs'],['@/lib/scoped-database','./scoped-database.mjs']])source=source.replaceAll(from,to);
  source=source.replaceAll('"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href));
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
}
writeFileSync(join(dir,'runtime.mjs'),`export const env={};export const supportsSitesIdentity=false;export let user='root-owner';export const setUser=id=>user=id;export const independentUserId=async()=>user;export const ownerAccount=id=>id==='root-owner';export const getChatGPTUser=async()=>null;`);
for(const [file,name] of [['lib/scoped-database.ts','scoped-database'],['lib/staff-scope.ts','scope'],['lib/server.ts','server'],['lib/postgres/adapter.ts','adapter'],['app/api/team/route.ts','team']])compile(file,name);
const load=name=>import(pathToFileURL(join(dir,name+'.mjs')));
const scope=await load('scope'),runtime=await load('runtime'),server=await load('server'),team=await load('team'),{createDatabase}=await load('adapter');
const pg=new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for(const file of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await pg.exec(readFileSync('supabase/migrations/'+file,'utf8'));
await pg.exec("SET search_path=club,pg_catalog; SELECT set_config('app.club_owner','root-owner',false)");
const query=client=>async(sql,args)=>{const r=await client.query(sql,args);return {rows:r.rows,count:r.affectedRows??r.rows.length};};
runtime.env.DB=createDatabase(query(pg),work=>pg.transaction(tx=>work(query(tx))));
const post=async data=>{const r=await team.POST(new Request('https://test.local/api/team',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));return {status:r.status,...await r.json()};};
const grant=(userId,changes={})=>post({userId,name:'Recepción prueba',role:'reception',status:'active',...changes});
try {
  test('Scope matrix separates activity from venue at Club Unión',()=>{
    for(const activity_scope of ['all','gym','padel','pilates'])for(const branch_scope of ['all','calle30','calle23','velez']){
      const p={role:'reception',activity_scope,branch_scope},valid=['all','gym'].includes(activity_scope)||branch_scope==='all';
      for(const activity of ['gym','padel','pilates'])for(const venue of ['calle30','calle23','velez','pilates',null,'unknown']){
        const expected=valid&&(activity_scope==='all'||activity_scope===activity)&&
          (activity==='gym'?['calle30','calle23','velez'].includes(venue)&&(branch_scope==='all'||branch_scope===venue):venue===(activity==='padel'?'velez':'pilates'));
        assert.equal(scope.allowsOperation(p,activity,venue),expected,JSON.stringify({p,activity,venue}));
      }
    }
    assert.equal(scope.allowsBranch({role:'reception',activity_scope:'padel',branch_scope:'all'},'velez'),true);
    assert.equal(scope.allowsOperation({role:'reception',activity_scope:'padel',branch_scope:'all'},'gym','velez'),false);
    assert.equal(scope.allowsOperation({role:'owner'},'gym','calle23'),true);
  });
  test('Missing or malformed reception scope fails closed',()=>{
    for(const p of [{role:'reception'},{role:'reception',activity_scope:'admin',branch_scope:'all'},{role:'reception',activity_scope:'gym',branch_scope:'invalid'},{role:'reception',activity_scope:'padel',branch_scope:'calle30'}]){
      assert.equal(scope.validStaffScope(p),false);
      for(const activity of ['gym','padel','pilates'])assert.equal(scope.allowsActivity(p,activity),false);
      assert.equal(scope.allowsBranch(p,'velez'),false);
    }
  });
  await test('Owners configure scopes and staff cannot expand their own access',async()=>{
    assert.equal((await grant('scoped',{activity_scope:'gym',branch_scope:'calle30'})).status,200);
    runtime.setUser('scoped');
    const p=await server.principal();assert.equal(p.activity_scope,'gym');assert.equal(p.branch_scope,'calle30');
    assert.equal((await grant('scoped',{activity_scope:'all'})).status,403);
    runtime.setUser('root-owner');
    assert.equal((await grant('bad',{activity_scope:'padel',branch_scope:'calle23'})).status,400);
    assert.equal((await grant('invalid',{activity_scope:'admin'})).status,400);
    assert.equal((await grant('unrestricted')).status,200);
    runtime.setUser('unrestricted');assert.deepEqual(await server.principal(),{userId:'unrestricted',owner:'root-owner',role:'reception',activity_scope:'all',branch_scope:'all'});
    runtime.setUser('root-owner');
    assert.equal((await grant('delegate',{role:'owner',activity_scope:'gym',branch_scope:'calle23'})).status,200);
    runtime.setUser('delegate');assert.equal((await server.principal()).activity_scope,'all');
    runtime.setUser('root-owner');
  });
  await test('Audit records exact before and after scope, reason and operator',async()=>{
    assert.equal((await grant('scoped',{activity_scope:'padel',branch_scope:'all',reason:'Reasignación al turno de pádel'})).status,200);
    const r=await pg.query("SELECT detail FROM audit WHERE detail LIKE '%Reasignación al turno de pádel%'");
    assert.equal(r.rows.length,1);const detail=r.rows[0].detail;
    assert.match(detail,/antes: Recepción prueba · reception · active · actividad gym · sede calle30/);
    assert.match(detail,/después: Recepción prueba · reception · active · actividad padel · sede all/);
    assert.match(detail,/operador root-owner/);
    runtime.setUser('scoped');assert.equal((await server.principal()).activity_scope,'padel');runtime.setUser('root-owner');
  });
  await test('Invalid persisted scope prevents access and owners retain global scope',async()=>{
    await pg.exec("BEGIN; ALTER TABLE staff DROP CONSTRAINT staff_activity_scope_check");
    await pg.query("UPDATE staff SET activity_scope='invalid' WHERE user_id='scoped'");runtime.setUser('scoped');
    await assert.rejects(server.principal(),e=>e.status===403);
    await pg.query("UPDATE staff SET activity_scope='invalid' WHERE user_id='delegate'");runtime.setUser('delegate');
    assert.equal((await server.principal()).activity_scope,'all');runtime.setUser('root-owner');await pg.exec('ROLLBACK');
  });
  await test('Revoked owner cannot grant scopes or add an audit from an already-started request',async()=>{
    const db=runtime.env.DB;runtime.setUser('delegate');
    const before=Number((await pg.query('SELECT COUNT(*) AS n FROM audit')).rows[0].n);
    runtime.env.DB={...db,async batch(statements){await pg.query("UPDATE staff SET status='revoked' WHERE user_id='delegate'");return db.batch(statements);}};
    try {assert.equal((await grant('must-not-exist')).status,403);assert.equal((await pg.query("SELECT user_id FROM staff WHERE user_id='must-not-exist'")).rows.length,0);assert.equal(Number((await pg.query('SELECT COUNT(*) AS n FROM audit')).rows[0].n),before);}
    finally {runtime.env.DB=db;runtime.setUser('root-owner');}
  });
} finally {await pg.close();rmSync(dir,{recursive:true,force:true});}
