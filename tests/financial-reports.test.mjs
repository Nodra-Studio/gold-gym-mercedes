import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const folder=mkdtempSync(join(tmpdir(),'financial-reports-'));
function compile(file,name){let source=readFileSync(file,'utf8');for(const name of ['club','csv','server','reporting','branches'])source=source.replaceAll('@/lib/'+name,'./'+name+'.mjs');writeFileSync(join(folder,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);}
for(const name of ['club','csv','reporting','branches'])compile('lib/'+name+'.ts',name);
compile('lib/postgres/adapter.ts','adapter');compile('app/api/reports/route.ts','route');
writeFileSync(join(folder,'server.mjs'),`export const state={role:'owner',owner:'owner-a',db:null};export class ClubError extends Error{constructor(m,status=400){super(m);this.status=status}};export async function principal(){if(!state.role)throw new ClubError('Ingresá',401);return {role:state.role,owner:state.owner}};export function permit(p,roles){if(!roles.includes(p.role))throw new ClubError('Sin permiso',403)};export function database(){return state.db};export function apiError(e){return Response.json({error:e.message},{status:e.status??503})}`);
const load=name=>import(pathToFileURL(join(folder,name+'.mjs')));
const {reportSelection,financialQuery,financialReport,percentageChange}=await load('reporting');
const {GET}=await load('route'),{state}=await load('server'),{createDatabase}=await load('adapter');
const db=new PGlite();
try{
await db.exec(`CREATE TABLE payments(id text,owner text,amount integer,method text,venue text,created_at text,voided integer);CREATE TABLE booking_payments(LIKE payments);CREATE TABLE cash_entries(id text,owner text,venue text,activity text,category text,kind text,amount integer,day text,reverses text);`);
const query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,count:r.rows.length}};
state.db=createDatabase(query,work=>work(query));
const insert=async(table,row)=>{const fields=Object.keys(row);await db.query(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(f=>row[f]));};
const payment=async(id,amount,date,venue='calle30',extra={})=>insert('payments',{id,owner:'owner-a',amount,method:'Efectivo',venue,created_at:date,voided:0,...extra});
await payment('before',999,'2026-10-01T02:59:59.999Z');await payment('start',1000,'2026-10-01T03:00:00.000Z');await payment('last',500,'2026-11-01T02:59:59.999Z',null);await payment('after',999,'2026-11-01T03:00:00.000Z');await payment('voided',9000,'2026-10-15T12:00:00Z','calle30',{voided:1});await payment('other',9999,'2026-10-15T12:00:00Z','calle30',{owner:'owner-b'});await payment('previous',600,'2026-09-15T12:00:00Z');await payment('pilates',200,'2026-10-15T12:00:00Z','pilates');
await insert('booking_payments',{id:'padel',owner:'owner-a',amount:300,method:'Tarjeta',venue:'velez',created_at:'2026-10-05T12:00:00Z',voided:0});
const cash=async(id,kind,amount,day,extra={})=>insert('cash_entries',{id,owner:'owner-a',venue:'velez',activity:'padel',category:kind==='expense'?'Limpieza':'Productos',kind,amount,day,reverses:null,...extra});
await cash('expense','expense',-400,'2026-10-03');await cash('undo-expense','reversal',400,'2026-10-04',{category:'Limpieza',reverses:'expense'});await cash('sale','sale',150,'2026-10-03');await cash('undo-sale','reversal',-150,'2026-10-04',{reverses:'sale'});await cash('previous-expense','expense',-100,'2026-09-04');await cash('old-unclassified','expense',-50,'2026-10-03',{activity:'unclassified',category:'Mantenimiento'});
const params=new URLSearchParams({view:'financial',from:'2026-10-01',to:'2026-10-31',compareFrom:'2026-09-01',compareTo:'2026-09-30'});
const get=async(extra={})=>GET(new Request('https://test.local/api/reports?'+new URLSearchParams({...Object.fromEntries(params),...extra})));
await test('Financial reports preserve Argentine day boundaries, corrections, unknown branches and owner isolation',async()=>{
const r=await get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const j=await r.json();assert.deepEqual(j.current.totals,{incoming:2000,outgoing:50,balance:1950,count:9});assert.deepEqual(j.comparison.totals,{incoming:1599,outgoing:100,balance:1499,count:3});assert.equal(j.current.venues.find(v=>v.key==='unknown').incoming,500);assert.equal(j.current.categories.find(v=>v.key==='Limpieza').outgoing,0);
});
await test('Filters combine branch, activity and category and CSV uses the same selection',async()=>{
let j=await(await get({venue:'velez',activity:'padel',category:'Pádel'})).json();assert.equal(j.current.totals.incoming,300);assert.equal(j.current.totals.outgoing,0);assert.equal(j.current.totals.count,1);
j=await(await get({activity:'unclassified'})).json();assert.equal(j.current.totals.outgoing,50);
j=await(await get({venue:'unknown'})).json();assert.equal(j.current.totals.incoming,500);
const csv=await get({activity:'padel',category:'Pádel',format:'csv'});assert.equal(csv.status,200);const text=await csv.text();assert.match(text,/"Actual";"2026-10-01";"2026-10-31";"Total";"";"300";"0";"300";"1"/);assert.doesNotMatch(text,/9999|9000/);
});
await test('Reports deny all nonowners before queries and reject malformed filters',async()=>{
for(const role of ['reception','gate','player','stock']){state.role=role;assert.equal((await get()).status,403);}state.role=null;assert.equal((await get()).status,401);state.role='owner';
for(const input of [{from:'2026-02-30'},{to:'2026-09-01'},{compareTo:'2028-01-01'},{venue:'other'},{activity:'all'},{category:'a'.repeat(61)},{format:'html'}])assert.equal((await get(input)).status,400,JSON.stringify(input));
});
await test('Empty monthly buckets, overlapping periods and percentage changes have explicit semantics',()=>{
const selection=reportSelection(new URLSearchParams({from:'2026-01-01',to:'2026-03-31',compareFrom:'2026-01-01',compareTo:'2026-01-31'}),'2026-03-31');const result=financialReport([{day:'2026-01-02',venue:null,activity:'gym',category:'Cuotas',incoming:100,outgoing:0,count:1}],selection);assert.equal(result.current.months.length,3);assert.equal(result.current.months[1].incoming,0);assert.equal(result.comparison.totals.incoming,100);assert.equal(percentageChange(100,0),null);assert.equal(percentageChange(-50,-100),50);
const automatic=reportSelection(new URLSearchParams({from:'2026-03-01',to:'2026-03-03'}),'2026-03-03');assert.equal(automatic.compareFrom,'2026-02-26');assert.equal(automatic.compareTo,'2026-02-28');
const command=financialQuery("owner' OR true --",{...selection,category:"x' OR true --"});assert.ok(!command.sql.includes("owner' OR true"));assert.equal(command.args[0],"owner' OR true --");
});
}finally{await db.close();rmSync(folder,{recursive:true,force:true});}
