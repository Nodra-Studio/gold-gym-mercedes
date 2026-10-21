import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import ts from 'typescript';

// The domain tests call PGlite directly. This fixture also runs the production
// postgres.js serializer over the PostgreSQL wire protocol, where the server's
// inferred JSONB OID previously caused serialized strings to be encoded twice.
const require = createRequire(import.meta.url), folder = mkdtempSync(join(tmpdir(), 'gold-driver-'));
function compile(file, name, pairs = []) {
  let source = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) source = source.replaceAll(from, to);
  source = source.replaceAll('"zod"', JSON.stringify(pathToFileURL(require.resolve('zod')).href));
  writeFileSync(join(folder, name + '.mjs'), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
compile('lib/postgres/query.ts', 'query');
compile('lib/postgres/adapter.ts', 'adapter');
compile('lib/club.ts', 'club');
compile('lib/branches.ts', 'branches');
compile('lib/csv.ts', 'csv');
writeFileSync(join(folder, 'server.mjs'), `
export let db, role='owner';export const setDB=value=>db=value;export const setRole=value=>role=value;
export const principal=async()=>({owner:'driver-owner',userId:role==='owner'?'driver-owner':'driver-reception',role});
export class ClubError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function permit(p,roles){if(!roles.includes(p.role))throw new ClubError('Sin permiso',403);}
export const body=req=>req.json();export const database=()=>db;
export const apiError=error=>Response.json({error:error instanceof ClubError?error.message:'Backend failure'},{status:error instanceof ClubError?error.status:503});
`);
compile('app/api/cash/route.ts', 'cash', [
  ['@/lib/server', './server.mjs'], ['@/lib/club', './club.mjs'], ['@/lib/branches', './branches.mjs'], ['@/lib/csv', './csv.mjs'],
]);
const load = name => import(pathToFileURL(join(folder, name + '.mjs')));
const { postgresConnectionQuery } = await load('query'), { createDatabase } = await load('adapter');
const runtime = await load('server'), cash = await load('cash'), { localDay } = await load('club');

// A local-only, single-connection protocol bridge. PGlite executes all query
// packets itself; this only supplies the startup handshake for postgres.js.
function packet(tag, body) {
  const out = Buffer.alloc(body.length + 5);
  out.write(tag);out.writeUInt32BE(body.length + 4, 1);body.copy(out, 5);
  return out;
}
async function wireServer(pg) {
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0), startup = true, queue = Promise.resolve();
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (startup) {
        if (buffer.length < 4 || buffer.length < buffer.readUInt32BE(0)) return;
        const length = buffer.readUInt32BE(0), protocol = buffer.readUInt32BE(4);
        buffer = buffer.subarray(length);
        assert.equal(protocol, 196608, 'The local test connection uses PostgreSQL v3 without TLS');
        startup = false;
        socket.write(Buffer.concat([
          packet('R', Buffer.alloc(4)),
          packet('S', Buffer.from('server_version\0' + '17.5\0')),
          packet('S', Buffer.from('client_encoding\0UTF8\0')),
          packet('Z', Buffer.from('I')),
        ]));
      }
      while (buffer.length >= 5 && buffer.length >= buffer.readUInt32BE(1) + 1) {
        const length = buffer.readUInt32BE(1) + 1, query = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        if (query[0] === 88) { socket.end();continue; }
        queue = queue.then(async () => {
          const response = await pg.execProtocolRaw(query);
          if (response.length && !socket.destroyed) socket.write(response);
        }).catch(error => socket.destroy(error));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    async close() { for (const socket of sockets) socket.destroy();await new Promise(resolve => server.close(resolve)); },
  };
}
async function post(payload) {
  const response = await cash.POST(new Request('https://test.local/api/cash', {
    method: 'POST',headers: {'content-type': 'application/json'},body: JSON.stringify(payload),
  }));
  return {status:response.status,...await response.json()};
}
const key = () => crypto.randomUUID();

try {
  await test('Native PostgreSQL driver preserves scalar bindings through real protocol messages', {timeout:30000}, async t => {
    const pg = new PGlite();await pg.waitReady;
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort())
      await pg.exec(readFileSync('supabase/migrations/'+file, 'utf8'));
    const server = await wireServer(pg);
    const client = postgres({host:'127.0.0.1',port:server.port,database:'postgres',user:'postgres',password:'local-test-only',ssl:false,prepare:false,max:1});
    const transaction = work => client.begin(async connection => {
      await connection.unsafe("SELECT set_config('role','gold_gym_app',true),set_config('search_path','club, pg_catalog',true),set_config('app.club_owner',$1,true)", ['driver-owner']);
      return work(postgresConnectionQuery(connection));
    });
    const db = createDatabase((sql, values)=>transaction(run=>run(sql,values)), transaction);
    runtime.setDB(db);
    try {
      await t.test('Serialized JSON, JSON strings, arrays, ordinary text, numbers, dates and null retain their values', async()=>{
        const serialized = JSON.stringify({action:'product',name:'Bebida "Clásica" — 500 ml',nested:{quote:"O'Connor"}});
        const row = await db.prepare("SELECT jsonb_typeof(?::jsonb) AS kind,?::jsonb->>'action' AS action,?::jsonb AS payload,?::jsonb AS json_string,?::jsonb AS items,?::text AS note,?::integer AS amount,?::date::text AS day,?::text AS optional")
          .bind(serialized,serialized,serialized,JSON.stringify('Texto con "comillas"'),JSON.stringify([1,'dos',null]),"O'Connor ? ::jsonb",2500,'2026-10-20',null).first();
        assert.equal(row.kind,'object');assert.equal(row.action,'product');assert.deepEqual(row.payload,JSON.parse(serialized));
        assert.equal(row.json_string,'Texto con "comillas"');assert.deepEqual(row.items,[1,'dos',null]);
        assert.equal(row.note,"O'Connor ? ::jsonb");assert.equal(row.amount,2500);assert.equal(row.day,'2026-10-20');assert.equal(row.optional,null);
      });

      await t.test('The actual cash endpoint creates a product, replays safely, receives stock and records a sale', async()=>{
        const input={action:'product',name:'Producto de prueba del driver',category:'Bebidas',price:2500,requestKey:key()};
        const created=await post(input);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.ok,true);
        const replay=await post(input);assert.equal(replay.status,200);assert.equal(replay.id,created.id);assert.equal(replay.replayed,true);
        assert.equal((await post({...input,price:2600})).status,409);
        const stored=await db.prepare('SELECT name,price,payload FROM products WHERE id=? AND owner=?').bind(created.id,'driver-owner').first();
        assert.equal(stored.name,input.name);assert.equal(stored.price,input.price);assert.deepEqual(JSON.parse(stored.payload),input);
        assert.equal((await db.prepare("SELECT count(*)::integer AS n FROM audit WHERE owner=? AND action='Caja: product'").bind('driver-owner').first()).n,1);
        runtime.setRole('reception');
        assert.equal((await post({...input,requestKey:key()})).status,403);
        await client.unsafe("INSERT INTO club.staff(user_id,owner,name,role,status,created_at) VALUES('driver-reception','driver-owner','Recepción','reception','active','2026-10-20T00:00:00.000Z')");
        assert.equal((await post({action:'receive',venue:'calle30',productId:created.id,quantity:3,note:'Ingreso de prueba',requestKey:key()})).status,200);
        const sale=await post({action:'sale',venue:'calle30',productId:created.id,quantity:1,expectedPrice:2500,method:'Efectivo',requestKey:key()});
        assert.equal(sale.status,200,JSON.stringify(sale));
        assert.equal((await db.prepare('SELECT sum(quantity)::integer AS n FROM stock_moves WHERE owner=? AND product_id=?').bind('driver-owner',created.id).first()).n,2);
        const movement=await db.prepare('SELECT amount,kind FROM cash_entries WHERE id=? AND owner=?').bind(sale.id,'driver-owner').first();
        assert.deepEqual(movement,{amount:2500,kind:'sale'});
        runtime.setRole('owner');
      });

      await t.test('Manual cash income and expense actions arrive as objects and retain their signs', async()=>{
        runtime.setRole('owner');
        for (const [action,sign] of [['expense',-1],['income',1]]) {
          const input={action,venue:'calle30',concept:'Movimiento de prueba',amount:1500,method:'Transferencia',day:localDay(),requestKey:key(),...(action==='expense'?{category:'Electricidad'}:{})};
          const saved=await post(input);assert.equal(saved.status,200,JSON.stringify(saved));
          const row=await db.prepare('SELECT amount,kind,payload FROM cash_entries WHERE id=? AND owner=?').bind(saved.id,'driver-owner').first();
          assert.equal(row.kind,action);assert.equal(row.amount,sign*1500);assert.deepEqual(JSON.parse(row.payload),input);
        }
      });

      await t.test('Backup recordset insertion keeps JSON arrays and numeric fields through the same transport',async()=>{
        const id=key(), records=[{id,owner:'driver-owner',name:'Plan restaurado de prueba',price:19000,days:30,access_scope:'gym',published:0}];
        const fields=Object.keys(records[0]);
        const result=await db.prepare(`INSERT INTO plans (${fields.join(',')}) SELECT ${fields.map(field=>`json_extract(value,'$.${field}')`).join(',')} FROM json_each(?) WHERE ?=?`)
          .bind(JSON.stringify(records),'driver-owner','driver-owner').run();
        assert.equal(result.meta.changes,1);
        assert.deepEqual(await db.prepare('SELECT id,name,price,days,access_scope,published FROM plans WHERE id=? AND owner=?').bind(id,'driver-owner').first(),{
          id,name:records[0].name,price:19000,days:30,access_scope:'gym',published:0,
        });
      });
    } finally { await client.end({timeout:1});await server.close();await pg.close(); }
  });
} finally { rmSync(folder,{recursive:true,force:true}); }
