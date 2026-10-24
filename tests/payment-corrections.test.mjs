import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const folder=mkdtempSync(join(tmpdir(),'gold-payment-corrections-')), require=createRequire(import.meta.url);
function compile(file,name,pairs=[]) {
 let source=readFileSync(file,'utf8');
 for(const [from,to] of pairs)source=source.replaceAll(from,to);
 source=source.replaceAll('"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href));
 writeFileSync(join(folder,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
}
compile('lib/postgres/adapter.ts','adapter');compile('lib/branches.ts','branches');
writeFileSync(join(folder,'server.mjs'),`export let db, actor='owner-a',role='owner';export const setDB=value=>db=value;export const setActor=(a,r)=>{actor=a;role=r};export const database=()=>db;export const principal=async()=>({owner:'owner-a',userId:actor,role});export class ClubError extends Error{constructor(message,status=400){super(message);this.status=status;}}export function permit(p,roles){if(!roles.includes(p.role))throw new ClubError('Sin permiso',403)}export const body=req=>req.json();export const apiError=e=>Response.json({error:e.message},{status:e instanceof ClubError?e.status:503});`);
compile('app/api/payment-corrections/route.ts','api',[['@/lib/server','./server.mjs'],['@/lib/branches','./branches.mjs']]);
const load=name=>import(pathToFileURL(join(folder,name+'.mjs')));
const {createDatabase}=await load('adapter'), runtime=await load('server'), api=await load('api');
const key=()=>crypto.randomUUID();
const pg=new PGlite();await pg.waitReady;
let scope='owner-a';
const transaction=work=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE gold_gym_app; SET LOCAL search_path=club,pg_catalog;');await tx.query("SELECT set_config('app.club_owner',$1,true)",[scope]);return work(async(sql,values)=>{const r=await tx.query(sql,values);return {rows:r.rows,count:r.affectedRows??r.rows.length};});});
const db=createDatabase((sql,values)=>transaction(run=>run(sql,values)),transaction);runtime.setDB(db);
async function post(input){const r=await api.POST(new Request('https://test.local/api/payment-corrections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));return {status:r.status,...await r.json()};}
async function get(source,id){const r=await api.GET(new Request(`https://test.local/api/payment-corrections?source=${source}&id=${id}`));return {status:r.status,...await r.json()};}
const correction=(id,extra={})=>({action:'edit',source:'membership',id,expectedRevision:1,amount:8000,method:'Transferencia',venue:'calle23',reason:'Se registró un importe equivocado',requestKey:key(),...extra});
try {
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const name of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await pg.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await pg.exec(`INSERT INTO club.plans(id,owner,name,price,days,access_scope) VALUES('plan-a','owner-a','Plan prueba',10000,30,'gym');
 INSERT INTO club.members(id,owner,name,dni,phone,plan_id,status,expires,created_at) VALUES('member-a','owner-a','Socio prueba','99112233','','plan-a','active','2026-12-15','2026-10-20T12:00:00.000Z');
 INSERT INTO club.staff(user_id,owner,name,role,status,created_at) VALUES('owner-b','owner-a','Dueño delegado','owner','active','2026-10-20T12:00:00.000Z'),('reception-a','owner-a','Recepción','reception','active','2026-10-20T12:00:00.000Z');
 INSERT INTO club.bookings(id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key) VALUES('booking-a','owner-a',1,'2026-11-01',480,'Reserva prueba','','booking','confirmed',20000,15000,'2026-10-20T12:00:00.000Z','bk-a');
 INSERT INTO club.booking_payments(id,owner,booking_id,kind,amount,method,created_at,venue) VALUES('deposit-a','owner-a','booking-a','deposit',10000,'Efectivo','2026-10-20T12:00:00.000Z','velez'),('settlement-a','owner-a','booking-a','settlement',5000,'Efectivo','2026-10-20T12:00:00.000Z','velez');`);
 async function payment(id,owner='owner-a'){await pg.query('INSERT INTO club.payments(id,owner,member_id,amount,method,created_at,request_key,venue) VALUES($1,$2,$3,10000,$4,$5,$6,$7)',[id,owner,'member-a','Efectivo','2026-10-20T12:00:00.000Z',key(),'calle30']);}
 await test('Corrections preserve original and new values, mandatory reason and membership validity',async()=>{
  await payment('payment-a');
  const input=correction('payment-a');const saved=await post(input);assert.equal(saved.status,200,JSON.stringify(saved));
  const result=await get('membership','payment-a');assert.equal(result.payment.amount,8000);assert.equal(result.payment.method,'Transferencia');assert.equal(result.payment.venue,'calle23');assert.equal(result.payment.revision,2);assert.equal(result.payment.voided,0);
  assert.equal(result.payment.created_at,'2026-10-20T12:00:00.000Z');assert.equal(result.changes.length,1);assert.equal(result.changes[0].actor,'owner-a');assert.equal(result.changes[0].reason,input.reason);
  assert.equal(JSON.parse(result.changes[0].before_state).amount,10000);assert.equal(JSON.parse(result.changes[0].after_state).amount,8000);
  assert.equal((await pg.query("SELECT expires FROM club.members WHERE id='member-a'")).rows[0].expires,'2026-12-15');
  assert.equal((await post({...input,requestKey:key(),reason:'  '})).status,400);
 });
 await test('Retry is idempotent; changed payload and stale revision never overwrite a correction',async()=>{
  await payment('payment-retry');const input=correction('payment-retry');const a=await post(input),b=await post(input);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(b.replayed,true);assert.equal(a.id,b.id);
  assert.equal((await post({...input,amount:9000})).status,409);assert.equal((await post({...input,requestKey:key(),amount:9000})).status,409);
  assert.equal((await get('membership',input.id)).changes.length,1);
 });
 await test('Annulments retain the payment and audit and cannot be applied twice',async()=>{
  await payment('payment-void');const input=correction('payment-void',{action:'void'});delete input.amount;delete input.method;delete input.venue;
  assert.equal((await post(input)).status,200);const r=await get('membership','payment-void');assert.equal(r.payment.voided,1);assert.equal(r.payment.amount,10000);assert.equal(r.changes.length,1);
  assert.equal((await post({...input,expectedRevision:2,requestKey:key()})).status,409);
  assert.equal((await db.prepare("SELECT COUNT(*)::integer n FROM audit WHERE owner=? AND action='Cobro anulado'").bind('owner-a').first()).n,1);
 });
 await test('Booking edits and annulments update only the exact effective amount and preserve outstanding balance',async()=>{
  const input=correction('deposit-a',{source:'booking',amount:8000,venue:'velez'});assert.equal((await post(input)).status,200);
  assert.equal((await db.prepare('SELECT deposit FROM bookings WHERE id=?').bind('booking-a').first()).deposit,13000);
  const bad=correction('deposit-a',{source:'booking',expectedRevision:2,amount:20000,venue:'velez'});assert.equal((await post(bad)).status,409);
  assert.equal((await db.prepare('SELECT deposit FROM bookings WHERE id=?').bind('booking-a').first()).deposit,13000);assert.equal((await get('booking','deposit-a')).changes.length,1);
  const annul=correction('settlement-a',{action:'void',source:'booking'});delete annul.amount;delete annul.method;delete annul.venue;assert.equal((await post(annul)).status,200);
  assert.equal((await db.prepare('SELECT deposit FROM bookings WHERE id=?').bind('booking-a').first()).deposit,8000);
  await db.prepare("INSERT INTO booking_payments(id,owner,booking_id,kind,amount,method,created_at,venue) VALUES(?,?,'booking-a','settlement',12000,'Tarjeta','2026-10-23T12:00:00.000Z','velez')").bind('settlement-new','owner-a').run();
 });
 await test('Reception, revoked owner and cross-club records cannot be changed even through the routine',async()=>{
  await payment('payment-protected');runtime.setActor('reception-a','reception');assert.equal((await post(correction('payment-protected'))).status,403);assert.equal((await get('membership','payment-protected')).status,403);
  const raw=await db.prepare('SELECT record_payment_change(?,?,?::jsonb) result').bind('owner-a','reception-a',JSON.stringify(correction('payment-protected'))).first();assert.equal(raw.result.status,403);
  runtime.setActor('owner-b','owner');await pg.exec("UPDATE club.staff SET status='revoked' WHERE user_id='owner-b'");assert.equal((await post(correction('payment-protected'))).status,403);
  runtime.setActor('owner-a','owner');scope='other-club';assert.equal((await post(correction('payment-protected'))).status,403);scope='owner-a';
  assert.equal((await get('membership','payment-protected')).payment.amount,10000);
 });
 await test('Correction history is append-only and Data API roles have no access',async()=>{
  await assert.rejects(db.prepare('UPDATE payment_changes SET reason=? WHERE owner=?').bind('Borrar rastro','owner-a').run(),/permission denied/);
  await assert.rejects(db.prepare('DELETE FROM payment_changes WHERE owner=?').bind('owner-a').run(),/permission denied/);
  await assert.rejects(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM club.payment_changes')}),/permission denied/);
 });
} finally {await pg.close();rmSync(folder,{recursive:true,force:true});}
