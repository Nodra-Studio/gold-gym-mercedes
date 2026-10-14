import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { nicoRegressions } from './nico-regressions.mjs';
const folder = mkdtempSync(join(tmpdir(), 'gold-postgres-')), require = createRequire(import.meta.url);
function compile(file, name, replacements = []) {
  let source = readFileSync(file, 'utf8');
  const pairs = [...replacements, ['@club/runtime', './runtime.mjs'], ['@/app/chatgpt-auth', './runtime.mjs'], ['@/lib/server', './server.mjs'], ['@/lib/club', './club.mjs'], ['@/lib/backup', './backup.mjs'], ['@/lib/padel-settings', './padel-settings.mjs'], ['@/lib/csv', './csv.mjs'], ['@/lib/branches','./branches.mjs'], ['@/lib/terminal-offline','./terminal-offline.mjs'], ['@/lib/fiscal-settings','./fiscal-lib.mjs'], ['@/lib/public-padel-validation','./public-padel-validation.mjs'], ['@/lib/public-padel','./public-padel.mjs']];
  for (const [from, to] of pairs) source = source.replaceAll(from, to);
  source = source.replaceAll("'zod'", '"zod"').replaceAll('"zod"', JSON.stringify(pathToFileURL(require.resolve('zod')).href));
  writeFileSync(join(folder, name + '.mjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
}
writeFileSync(join(folder, 'runtime.mjs'), `export const env={}; export const supportsSitesIdentity=false; export let user=null; export let owner='owner-a'; export let identityError=null; export const setIdentityError=x=>identityError=x; export const setUser=x=>user=x; export const setOwner=x=>owner=x; export async function independentUserId(){if(identityError)throw identityError;return user}; export function ownerAccount(id){return id===owner}; export async function getChatGPTUser(){throw Error('Untrusted Sites identity used')}`);
for (const [file, name, replacements] of [
  ['lib/public-padel.ts','public-padel'], ['lib/public-padel-validation.ts','public-padel-validation'], ['lib/branches.ts','branches'], ['lib/server.ts','server'], ['lib/club.ts','club'], ['lib/terminal-offline.ts','terminal-offline'], ['lib/fiscal-settings.ts','fiscal-lib'], ['lib/backup.ts','backup',[['./club','./club.mjs']]], ['lib/padel-settings.ts','padel-settings'], ['lib/csv.ts','csv'], ['lib/postgres/adapter.ts','adapter'], ['lib/auth/config.ts','auth-config'],
  ...['tariffs','public-prices','public-padel','padel-requests','club','team','player','settings','booking-payments','reports','export','backup','cash','offline-access','fiscal-settings'].map(x=>[`app/api/${x}/route.ts`, x+'-api']),
]) compile(file, name, replacements);
const load = name => import(pathToFileURL(join(folder, name+'.mjs')));
const runtime = await load('runtime'), { createDatabase, postgresQuery } = await load('adapter');
const api = await load('club-api'), team = await load('team-api'), player = await load('player-api'), ledger = await load('booking-payments-api'), reports = await load('reports-api'), exporter = await load('export-api'), backup = await load('backup-api'), config = await load('auth-config');
const cash=await load('cash-api');
const offline=await load('offline-access-api'),fiscal=await load('fiscal-settings-api'),terminal=await load('terminal-offline'),logic=await load('club');
const pg = new PGlite();
let clubOwner = 'owner-a';
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for (const file of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()) await pg.exec(readFileSync('supabase/migrations/'+file,'utf8'));
const query = connection => async (sql, values) => {
  const result = await connection.query(sql, values);
  return { rows: result.rows, count: result.affectedRows ?? result.rows.length };
};
async function transaction(work, readOnly=false) {
  return pg.transaction(async tx => {
    if(readOnly)await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await tx.exec('SET LOCAL ROLE gold_gym_app; SET LOCAL search_path TO club, pg_catalog;');
    await tx.query("SELECT set_config('app.club_owner', $1, true)", [clubOwner]);
    if(!readOnly)await tx.query('SELECT pg_advisory_xact_lock(71946201)');
    return work(query(tx));
  });
}
runtime.env.DB = createDatabase((sql, values)=>transaction(q=>q(sql,values)), transaction);
async function post(endpoint, payload) {
  const r = await endpoint.POST(new Request('https://test.local/api/test', { method:'POST', headers:{'content-type':'application/json',origin:'https://test.local'}, body:JSON.stringify(payload) }));
  return { status:r.status,...await r.json() };
}
async function get(endpoint=api, search='') {
  const r=await endpoint.GET(new Request('https://test.local/api/test'+search));return {status:r.status,...await r.json()};
}
const key=()=>crypto.randomUUID();
try {
  await test('PostgreSQL domain flows with RLS and independent accounts', async t=> {
    await t.test('No identity or new account can become owner', async()=> {
      assert.equal((await get()).status,401);
      runtime.setUser('unassigned');assert.equal((await get()).status,403);
      assert.equal((await get(team)).role,'pending');
    });
    runtime.setUser('owner-a');
    await t.test('An incomplete second factor returns a useful 403 without treating it as infrastructure failure',async()=>{
      runtime.setIdentityError(Object.assign(new Error('Required'),{code:'MFA_REQUIRED'}));
      try { const r=await get();assert.equal(r.status,403);assert.match(r.error,/verificación en dos pasos/); }
      finally { runtime.setIdentityError(null); }
    });
    await t.test('SQL placeholders preserve literals and parameters', ()=>assert.equal(postgresQuery("SELECT '?' as literal, ? as value"), "SELECT '?' as literal, $1 as value"));
    await t.test('Schema denies Data API roles and isolates club rows', async()=>{
      await assert.rejects(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM club.members')}));
      await assert.rejects(runtime.env.DB.prepare('INSERT INTO plans(id,owner,name,price,days) VALUES(?,?,?,?,?)').bind(key(),'other-owner','Blocked',1,30).run());
      assert.equal((await runtime.env.DB.prepare('SELECT * FROM plans WHERE owner=?').bind('other-owner').all()).results.length,0);
    });
    await t.test('Read batches use one query while preserving values, order, empty results and RLS', async()=>{
      let calls=0, mode;
      const optimized=createDatabase(
        (sql,values)=>transaction(q=>q(sql,values)),
        (work,readOnly)=>{mode=readOnly;return transaction(q=>work(async(sql,values)=>{calls++;return q(sql,values)}),readOnly)},
      );
      const rows=await optimized.batch([
        optimized.prepare("SELECT ?::text AS label, '?'::text AS literal, n FROM generate_series(1,3) n ORDER BY n DESC").bind("O'Connor ?"),
        optimized.prepare('SELECT ?::integer AS amount, NULL::text AS optional').bind(42000),
        optimized.prepare('SELECT id FROM members WHERE owner=?').bind('other-owner'),
      ]);
      assert.equal(calls,1);assert.equal(mode,true);
      assert.deepEqual(rows[0].results.map(x=>x.n),[3,2,1]);
      assert.equal(rows[0].results[0].label,"O'Connor ?");assert.equal(rows[0].results[0].literal,'?');
      assert.deepEqual(rows[1].results,[{amount:42000,optional:null}]);
      assert.deepEqual(rows[2].results,[]);assert.equal(rows[2].meta.changes,0);
      assert.deepEqual(await optimized.batch([]),[]);assert.equal(calls,1);
    });
    await t.test('Transaction configuration resets role and owner after commit',async()=>{
      await pg.transaction(async tx=>{
        await tx.query("SELECT set_config('role','gold_gym_app',true), set_config('search_path','club, pg_catalog',true), set_config('statement_timeout','15s',true), set_config('app.club_owner',$1,true)",['other-owner']);
        const r=await tx.query("SELECT current_user AS role,current_setting('app.club_owner') AS owner");
        assert.equal(r.rows[0].role,'gold_gym_app');assert.equal(r.rows[0].owner,'other-owner');
        assert.deepEqual((await tx.query('SELECT id FROM members')).rows,[]);
      });
      const r=await pg.query("SELECT current_user AS role,current_setting('app.club_owner',true) AS owner");
      assert.notEqual(r.rows[0].role,'gold_gym_app');assert.notEqual(r.rows[0].owner,'other-owner');
    });
    await t.test('Seed loads valid PostgreSQL records once',async()=>{
      assert.equal((await post(api,{action:'seed'})).status,200);
      assert.equal((await get()).members.length,6);
      assert.equal((await post(api,{action:'seed'})).status,409);
    });
    const data=await get(), member=data.members.find(m=>m.dni==='99000001');
    await t.test('Padel agenda reads bookings without unrelated member or payment payloads',async()=>{
      const scoped=await get(api,'?view=padel');
      assert.equal(scoped.status,200);
      assert.deepEqual(scoped.bookings,data.bookings);
      for(const key of ['members','plans','payments','accesses','sessions','enrollments','audit','memberships'])assert.deepEqual(scoped[key],[]);
      runtime.setUser(null);assert.equal((await get(api,'?view=padel')).status,401);runtime.setUser('owner-a');
    });

    await t.test('Pilates and gym access are enforced by the server',async()=>{
      const m=data.members.find(m=>m.dni==='99000003');
      await runtime.env.DB.prepare("UPDATE members SET status='active' WHERE id=?").bind(m.id).run();
      assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Calle 30'})).allowed,false);
      assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Pilates'})).allowed,true);
      assert.equal((await post(api,{action:'access',dni:member.dni,venue:'Pilates'})).allowed,false);
      assert.equal((await post(api,{action:'access',dni:member.dni})).status,400);
      await runtime.env.DB.prepare("UPDATE members SET status='paused' WHERE id=?").bind(m.id).run();
    });
    await t.test('Public requests keep receipts private and require atomic staff confirmation',async()=>{
      const pub=await load('public-padel-api'),review=await load('padel-requests-api');
      const {localDay,addDays}=await load('club');clubOwner='public-owner';runtime.setOwner('public-owner');process.env.GOLD_GYM_OWNER_ID='public-owner';
      await runtime.env.DB.prepare('INSERT INTO settings(owner,padel_price,booking_days,cancel_hours) VALUES(?,?,?,?)').bind('public-owner',24000,30,24).run();
      await runtime.env.DB.prepare('UPDATE settings SET price_published=1 WHERE owner=?').bind('public-owner').run();
      const payload={day:addDays(localDay(),5),court:1,start:480,name:'Jugador Prueba',phone:'5492324000000',expectedPrice:24000,requestKey:key()};
      runtime.setUser(null);
      const availability=await get(pub,'?day='+payload.day);assert.equal(availability.status,200);assert.equal('mine' in availability,false);
      assert.equal((await get(pub,'?day=invalid')).status,400);assert.equal((await get(pub,'?day='+addDays(localDay(),31))).status,400);assert.ok(Array.isArray(availability.occupied));assert.equal(availability.settings.booking_days,30);
      assert.equal((await post(pub,{...payload,paymentMethod:'Efectivo',requestKey:key()})).status,400);
      const requested=await post(pub,payload);assert.equal(requested.status,201,JSON.stringify(requested));
      assert.equal((await post(pub,payload)).id,requested.id);
      assert.equal((await get(review)).status,401);
      assert.equal((await post(review,{id:requested.id,action:'confirm',deposit:12000})).status,401);
      assert.equal((await post(pub,{...payload,requestKey:key(),start:570,receipt:Buffer.from('<script>bad</script>').toString('base64'),receiptType:'image/png'})).status,400);
      runtime.setUser('public-owner');
      assert.equal((await get(review)).requests[0].amount,24000);
      assert.equal('receipt' in (await get(review)).requests[0],false);
      assert.equal((await post(review,{id:requested.id,action:'confirm',deposit:24001})).status,400);
      assert.equal((await post(review,{id:requested.id,action:'confirm',deposit:12000,method:'Efectivo'})).status,200);
      assert.equal((await post(review,{id:requested.id,action:'confirm',deposit:12000})).status,409);
      const b=(await get()).bookings.find(b=>b.request_key==='public:'+requested.id);
      assert.ok(b);assert.equal(b.deposit,12000);
      const ledger=await runtime.env.DB.prepare('SELECT * FROM booking_payments WHERE booking_id=?').bind(b.id).all();assert.equal(ledger.results.length,1);assert.equal(ledger.results[0].method,'Efectivo');
      const confirmedReplay=await post(pub,payload);assert.equal(confirmedReplay.status,200);assert.equal(confirmedReplay.replayed,true);assert.equal(confirmedReplay.id,requested.id);
      runtime.setUser(null);assert.equal((await post(pub,{...payload,requestKey:key()})).status,409);
      // Competing customer requests may coexist; only one confirmed booking can occupy a slot.
      const a=await post(pub,{...payload,start:570,requestKey:key(),receipt:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',receiptType:'image/png'});
      const c=await post(pub,{...payload,start:570,phone:'5492324000001',requestKey:key()});
      assert.equal(a.status,201);assert.equal(c.status,201);
      runtime.setUser('public-owner');
      assert.equal((await post(review,{id:a.id,action:'confirm',deposit:0})).status,200);
      assert.equal((await post(review,{id:c.id,action:'confirm',deposit:0})).status,409);
      assert.equal((await post(review,{id:c.id,action:'reject',deposit:0})).status,200);
      const protectedDownload=await review.GET(new Request('https://test.local/api/test?receipt='+a.id));assert.equal(protectedDownload.status,200);assert.equal(protectedDownload.headers.get('content-type'),'image/png');assert.match(protectedDownload.headers.get('content-disposition'),/attachment/);
      runtime.setUser(null);assert.equal((await review.GET(new Request('https://test.local/api/test?receipt='+a.id))).status,401);runtime.setUser('public-owner');
      const saved=await get(exporter);assert.equal(saved.records.booking_requests.length,3);const {validateBackup}=await load('backup');assert.equal(validateBackup(Object.fromEntries(Object.entries(saved).filter(([k])=>k!=='status'))).records.booking_requests.length,3);
      delete process.env.GOLD_GYM_OWNER_ID;clubOwner='owner-a';runtime.setOwner('owner-a');runtime.setUser('owner-a');
    });
    await t.test('Concurrent confirmation prevents a stale rejection and keeps the payment',async()=>{
      const pub=await load('public-padel-api'),review=await load('padel-requests-api');
      const {localDay,addDays}=await load('club');
      const originalDB=runtime.env.DB,previousPublicOwner=process.env.GOLD_GYM_OWNER_ID;
      clubOwner='request-race-owner';runtime.setOwner(clubOwner);process.env.GOLD_GYM_OWNER_ID=clubOwner;
      try {
        await originalDB.prepare('INSERT INTO settings(owner,padel_price,booking_days,cancel_hours,price_published) VALUES(?,?,?,?,?)').bind(clubOwner,24000,30,24,1).run();
        runtime.setUser(null);
        const payload={day:addDays(localDay(),5),court:2,start:480,name:'Solicitud concurrente',phone:'5492324000005',expectedPrice:24000,requestKey:key()};
        assert.equal((await post(pub,{...payload,phone:'1234  56',requestKey:key()})).status,400);
        const formatted=await post(pub,{...payload,court:3,phone:'+54 (9) 2324-123456',requestKey:key()});assert.equal(formatted.status,201,JSON.stringify(formatted));
        const normalized=await originalDB.prepare('SELECT phone FROM booking_requests WHERE id=? AND owner=?').bind(formatted.id,clubOwner).first();assert.equal(normalized.phone,'+5492324123456');
        const requested=await post(pub,payload);assert.equal(requested.status,201,JSON.stringify(requested));
        runtime.setUser(clubOwner);
        let interleaved=false;
        runtime.env.DB={
          ...originalDB,
          async batch(statements) {
            if(!interleaved && statements.some(statement=>statement.sql.startsWith("UPDATE booking_requests SET status='rejected'"))) {
              interleaved=true;
              runtime.env.DB=originalDB;
              const confirmed=await post(review,{id:requested.id,action:'confirm',deposit:12000,method:'Efectivo'});
              assert.equal(confirmed.status,200,JSON.stringify(confirmed));
            }
            return originalDB.batch(statements);
          },
        };
        const rejected=await post(review,{id:requested.id,action:'reject'});
        assert.equal(interleaved,true);assert.equal(rejected.status,409,JSON.stringify(rejected));
        const saved=await originalDB.prepare('SELECT status,booking_id FROM booking_requests WHERE id=? AND owner=?').bind(requested.id,clubOwner).first();
        assert.equal(saved.status,'confirmed');assert.ok(saved.booking_id);
        const booking=await originalDB.prepare('SELECT status,deposit FROM bookings WHERE id=? AND owner=?').bind(saved.booking_id,clubOwner).first();
        assert.equal(booking.status,'confirmed');assert.equal(booking.deposit,12000);
        const payments=await originalDB.prepare('SELECT amount,method FROM booking_payments WHERE booking_id=? AND owner=?').bind(saved.booking_id,clubOwner).all();
        assert.deepEqual(payments.results,[{amount:12000,method:'Efectivo'}]);
        const audit=await originalDB.prepare("SELECT id FROM audit WHERE owner=? AND action='Solicitud de pádel rechazada'").bind(clubOwner).all();
        assert.equal(audit.results.length,0);
      } finally {
        runtime.env.DB=originalDB;
        if(previousPublicOwner===undefined)delete process.env.GOLD_GYM_OWNER_ID;else process.env.GOLD_GYM_OWNER_ID=previousPublicOwner;
        clubOwner='owner-a';runtime.setOwner('owner-a');runtime.setUser('owner-a');
      }
    });
    await t.test('A public retry recovers the original request after its turn has passed',async()=>{
      const pub=await load('public-padel-api');
      const {localDay,addDays}=await load('club');
      const previousPublicOwner=process.env.GOLD_GYM_OWNER_ID;
      clubOwner='request-past-owner';runtime.setOwner(clubOwner);process.env.GOLD_GYM_OWNER_ID=clubOwner;
      try {
        await runtime.env.DB.prepare('INSERT INTO settings(owner,padel_price,booking_days,cancel_hours,price_published) VALUES(?,?,?,?,?)').bind(clubOwner,24000,30,24,1).run();
        const id=key(),payload={day:addDays(localDay(),-1),court:1,start:480,name:'Solicitud pasada',phone:'5492324000006',expectedPrice:24000,requestKey:key()};
        await runtime.env.DB.prepare('INSERT INTO booking_requests(id,owner,court,day,start,name,phone,amount,request_key,created_at,deposit_expected) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,clubOwner,payload.court,payload.day,payload.start,payload.name,payload.phone,24000,payload.requestKey,new Date().toISOString(),12000).run();
        runtime.setUser(null);
        const replay=await post(pub,payload);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.replayed,true);assert.equal(replay.id,id);assert.equal(replay.deposit_expected,12000);
        assert.equal((await post(pub,{...payload,requestKey:key()})).status,400);
        const requests=await runtime.env.DB.prepare('SELECT id FROM booking_requests WHERE owner=?').bind(clubOwner).all();assert.equal(requests.results.length,1);
      } finally {
        if(previousPublicOwner===undefined)delete process.env.GOLD_GYM_OWNER_ID;else process.env.GOLD_GYM_OWNER_ID=previousPublicOwner;
        clubOwner='owner-a';runtime.setOwner('owner-a');runtime.setUser('owner-a');
      }
    });
    await t.test('Central tariffs preserve quotes and independent memberships enforce activity access',async()=>{
      const tariffs=await load('tariffs-api'),pubPrices=await load('public-prices-api'),pub=await load('public-padel-api');
      const {localDay,addDays}=await load('club');
      clubOwner='tariff-owner';runtime.setOwner(clubOwner);runtime.setUser(clubOwner);process.env.GOLD_GYM_OWNER_ID=clubOwner;
      try {
        assert.equal((await post(api,{action:'seed'})).status,200);
        const d=await get(),m=d.members[0],gym=d.plans.find(x=>x.access_scope==='gym'),pilates=d.plans.find(x=>x.access_scope==='pilates');
        assert.equal((await get(pubPrices)).plans.length,0);
        const plan={kind:'plan',id:gym.id,price:42000,published:true,accessScope:'gym',expectedPrice:gym.price,expectedPublished:0,expectedScope:'gym'};
        assert.equal((await post(tariffs,plan)).status,200);
        assert.equal((await post(tariffs,plan)).status,409);
        assert.equal((await get(pubPrices)).plans[0].price,42000);
        const padel={kind:'padel',price:30000,depositPercent:50,alias:'club.prueba',whatsapp:'5492324000000',expectedRevision:0};
        const saved=await post(tariffs,padel);assert.equal(saved.status,200,JSON.stringify(saved));
        const future=addDays(localDay(),5),request={day:future,court:4,start:480,name:'Prueba Tarifas',phone:'5492324000002',expectedPrice:30000,expectedRevision:1,requestKey:key()};
        runtime.setUser(null);const quote=await post(pub,request);assert.equal(quote.status,201,JSON.stringify(quote));assert.equal(quote.deposit_expected,15000);
        assert.equal((await get(tariffs)).status,401);
        runtime.setUser(clubOwner);
        assert.equal((await post(tariffs,{...padel,price:35000,expectedRevision:1})).status,200);
        assert.equal((await post(pub,{...request,requestKey:key(),start:570})).status,409);
        const historic=await runtime.env.DB.prepare('SELECT amount,deposit_expected FROM booking_requests WHERE id=?').bind(quote.id).first();assert.equal(historic.amount,30000);assert.equal(historic.deposit_expected,15000);
        await runtime.env.DB.prepare("UPDATE members SET plan_id=?,expires=?,status='active' WHERE id=?").bind(gym.id,addDays(localDay(),-1),m.id).run();
        const added=await post(api,{action:'membership',memberId:m.id,planId:pilates.id,expires:future,status:'active'});assert.equal(added.status,200,JSON.stringify(added));
        const mm=(await get()).memberships.find(x=>x.member_id===m.id);
        assert.ok(mm);assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Pilates'})).allowed,true);assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Calle 30'})).allowed,false);
        const payment={action:'payment',venue:'pilates',memberId:m.id,membershipId:mm.id,expectedPrice:pilates.price,method:'Efectivo',requestKey:key()};
        assert.equal((await post(api,payment)).status,200);assert.equal((await post(api,payment)).replayed,true);
        assert.equal((await post(api,{...payment,venue:'calle30'})).status,409);
        assert.equal((await post(api,{...payment,membershipId:undefined})).status,409);
        const renewed=await get();assert.equal(renewed.members.find(x=>x.id===m.id).expires,addDays(localDay(),-1));assert.ok(renewed.memberships[0].expires>future);
        const staleEdit=await post(api,{action:'membership',id:mm.id,memberId:m.id,planId:pilates.id,expires:mm.expires,status:'paused',expectedExpires:mm.expires,expectedStatus:mm.status});
        assert.equal(staleEdit.status,409,JSON.stringify(staleEdit));
        const afterStaleEdit=(await get()).memberships.find(x=>x.id===mm.id);assert.equal(afterStaleEdit.expires,renewed.memberships[0].expires);assert.equal(afterStaleEdit.status,'active');
        assert.equal(renewed.payments.length,1);assert.equal(renewed.payments[0].venue,'pilates');
        assert.equal((await post(api,{action:'session',name:'Pilates prueba',day:future,time:'12:00',capacity:3,venue:'Pilates'})).status,200);
        const session=(await get()).sessions.find(x=>x.name==='Pilates prueba');assert.equal((await post(api,{action:'enroll',sessionId:session.id,memberId:m.id})).status,200);
        await runtime.env.DB.prepare("UPDATE members SET status='paused' WHERE id=?").bind(m.id).run();assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Pilates'})).allowed,false);
        assert.equal((await post(team,{userId:'tariff-reception',name:'Recepción',role:'reception',status:'active'})).status,200);runtime.setUser('tariff-reception');
        assert.equal((await post(tariffs,{...plan,price:45000,expectedPrice:42000,expectedPublished:1})).status,200);
        assert.equal((await post(tariffs,{...plan,accessScope:'all',expectedPrice:45000,expectedPublished:1})).status,403);
        runtime.setUser(clubOwner);const snapshot=await get(exporter);const {validateBackup}=await load('backup');const valid=validateBackup(Object.fromEntries(Object.entries(snapshot).filter(([k])=>k!=='status')));assert.equal(valid.records.member_memberships.length,1);assert.equal(valid.records.payments[0].membership_id,mm.id);
        clubOwner='tariff-restored';runtime.setOwner(clubOwner);runtime.setUser(clubOwner);
        const restore=await post(backup,{action:'restore',requestKey:key(),backup:valid});assert.equal(restore.status,200,JSON.stringify(restore));
        const restored=await get();assert.equal(restored.memberships.length,1);assert.equal(restored.payments[0].membership_id,restored.memberships[0].id);assert.equal((await get(tariffs)).padel.padel_price,35000);

      } finally {delete process.env.GOLD_GYM_OWNER_ID;clubOwner='owner-a';runtime.setOwner('owner-a');runtime.setUser('owner-a');}
    });
    await t.test('Payments renew dates atomically and retries do not duplicate',async()=>{
      const payload={action:'payment',venue:'calle30',memberId:member.id,expectedPrice:30000,method:'Efectivo',requestKey:key()};
      const r=await post(api,payload);assert.equal(r.status,200,JSON.stringify(r));
      const afterPayment=await get(),renewedExpires=afterPayment.members.find(x=>x.id===member.id).expires;
      assert.equal((await post(api,payload)).replayed,true);assert.equal((await post(api,{...payload,venue:'calle23'})).status,409);
      const updated=await get();assert.equal(updated.payments.length,1);assert.equal(updated.payments[0].venue,'calle30');assert.equal(updated.members.find(x=>x.id===member.id).expires,renewedExpires);assert.ok(renewedExpires>member.expires);
    });
    await t.test('Batch failure rolls back earlier writes',async()=>{
      const id=key();await assert.rejects(runtime.env.DB.batch([
        runtime.env.DB.prepare('INSERT INTO plans(id,owner,name,price,days) VALUES(?,?,?,?,?)').bind(id,clubOwner,'Rollback',1,30),
        runtime.env.DB.prepare('INSERT INTO plans(id,owner,name,price,days) VALUES(?,?,?,?,?)').bind(id,clubOwner,'Duplicate',1,30),
      ]));assert.equal(await runtime.env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(id).first(),null);
    });
    await t.test('Owner grants, restricts and revokes staff access',async()=>{
      assert.equal((await post(team,{userId:'reception',name:'Recepción',role:'reception',status:'active'})).status,200);
      runtime.setUser('reception');assert.equal((await get()).status,200);assert.equal((await post(api,{action:'plan',name:'Forbidden',price:1,days:30})).status,403);
      runtime.setUser('owner-a');await post(team,{userId:'reception',name:'Recepción',role:'reception',status:'revoked'});
      runtime.setUser('reception');assert.equal((await get()).status,403);runtime.setUser('owner-a');
    });
    const day = new Date(Date.now()+86400000*5).toISOString().slice(0,10);
    let booking;
    await t.test('Padel deposit, settlement and duplicate slots retain constraints',async()=>{
      const p={action:'booking',court:1,day,start:480,name:'Prueba PostgreSQL',phone:'',kind:'booking',amount:24000,deposit:6000,depositMethod:'Efectivo',requestKey:key(),weeks:1};
      const r=await post(api,p);assert.equal(r.status,200,JSON.stringify(r));
      assert.equal((await post(api,{...p,requestKey:key()})).status,409);
      booking=(await get()).bookings.find(b=>b.name===p.name);
      const s=await post(api,{action:'settleBooking',id:booking.id,expectedDeposit:6000,method:'Transferencia'});assert.equal(s.status,200,JSON.stringify(s));
      assert.equal((await post(api,{action:'settleBooking',id:booking.id,expectedDeposit:6000,method:'Transferencia'})).replayed,true);
      const h=await get(ledger,'?bookingId='+booking.id);assert.equal(h.payments.length,2);
    });
    await t.test('Reports aggregate PostgreSQL payments',async()=>{
      const r=await get(reports);assert.equal(r.status,200,JSON.stringify(r));
    });
    let product, sale;
    await t.test('Cash roles, validation and idempotent catalog creation',async()=>{
      runtime.setUser('unknown'); assert.equal((await get(cash)).status,403); runtime.setUser('owner-a');
      const input={action:'product',name:'Monster',category:'Bebidas',price:2500,requestKey:key()};
      const r=await post(cash,input);assert.equal(r.status,200,JSON.stringify(r));product=r.id;
      assert.equal((await post(cash,input)).replayed,true);
      assert.equal((await post(cash,{...input,price:3000})).status,409);
      assert.equal((await post(cash,{action:'expense',venue:'bad',category:'Otros',concept:'Gasto',amount:50,method:'Efectivo',day:new Date().toISOString().slice(0,10),requestKey:key()})).status,400);
    });
    await t.test('Stock is branch-specific; concurrent last-unit sales allow one winner',async()=>{
      const input={action:'receive',venue:'velez',productId:product,quantity:1,note:'Carga inicial',requestKey:key()};
      assert.equal((await post(cash,input)).status,200);assert.equal((await post(cash,input)).replayed,true);
      const payload={action:'sale',venue:'velez',productId:product,quantity:1,expectedPrice:2500,method:'Efectivo',requestKey:key()};
      assert.equal((await post(cash,{...payload,venue:'pilates'})).status,409);
      const results=await Promise.all([post(cash,payload),post(cash,{...payload,requestKey:key()})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);sale=results.find(r=>r.status===200).id;
      const retry=await post(cash,payload);assert.equal(retry.status,200);assert.equal(retry.replayed,true);
      const data=await get(cash);assert.equal(data.status,200,JSON.stringify(data));assert.equal(data.stock.find(s=>s.venue==='velez').quantity,0);
      assert.equal((await get(cash,'?venue=pilates')).summary.incoming,0);
    });
    await t.test('Expense and reversal retain originals, restore stock once and enforce owner role',async()=>{
      const today=(await get()).today;
      assert.equal((await post(cash,{action:'expense',venue:'pilates',category:'Limpieza',concept:'Factura limpieza',amount:500,method:'Transferencia',day:today,requestKey:key()})).status,200);
      await post(team,{userId:'reception',name:'Recepción',role:'reception',status:'active'});runtime.setUser('reception');
      assert.equal((await post(cash,{action:'reverse',id:sale,expectedRevision:1,reason:'Devolución',requestKey:key()})).status,403);
      assert.equal((await post(cash,{action:'product',name:'Otro',category:'Bebidas',price:100,requestKey:key()})).status,403);
      runtime.setUser('owner-a');
      const payload={action:'reverse',id:sale,expectedRevision:1,reason:'Producto devuelto',requestKey:key()};
      assert.equal((await post(cash,payload)).status,200);assert.equal((await post(cash,payload)).replayed,true);
      assert.equal((await post(cash,{...payload,requestKey:key()})).status,409);
      const data=await get(cash,'?category=Productos');assert.equal(data.summary.balance,0);assert.equal(data.entries.length,2);assert.equal(data.stock.find(s=>s.venue==='velez').quantity,1);
      assert.equal((await get(cash,'?venue=pilates&category=Limpieza')).summary.balance,-500);
      await assert.rejects(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT club.record_cash('owner-a','attacker','{}')")}));
      await assert.rejects(runtime.env.DB.prepare('SELECT record_cash(?,?,?::jsonb)').bind('other-owner','owner-a',JSON.stringify(payload)).first());
    });
    await t.test('Failed audit rolls the cash operation and stock back together',async()=>{
      await pg.exec("CREATE FUNCTION club.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='Caja: sale' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER cash_test_failure BEFORE INSERT ON club.audit FOR EACH ROW EXECUTE FUNCTION club.test_audit_failure();");
      const before=await get(cash);
      const failed=await post(cash,{action:'sale',venue:'velez',productId:product,quantity:1,expectedPrice:2500,method:'Efectivo',requestKey:key()});
      assert.equal(failed.status,503);
      const after=await get(cash);assert.deepEqual(after.stock,before.stock);assert.equal(after.summary.count,before.summary.count);
      await pg.exec('DROP TRIGGER cash_test_failure ON club.audit; DROP FUNCTION club.test_audit_failure();');
      await post(team,{userId:'gate-cash',name:'Terminal',role:'gate',status:'active'});runtime.setUser('gate-cash');assert.equal((await get(cash)).status,403);runtime.setUser('owner-a');
    });
    await t.test('Transfers conserve inventory, pair both sides and never duplicate cash',async()=>{
      const before=await get(cash);
      const input={action:'transfer',venue:'velez',destination:'pilates',productId:product,quantity:1,note:'Reposición Pilates',requestKey:key()};
      const r=await post(cash,input);assert.equal(r.status,200,JSON.stringify(r));assert.equal((await post(cash,input)).replayed,true);
      const after=await get(cash);assert.equal(after.summary.count,before.summary.count);assert.equal(after.stock.find(s=>s.venue==='velez').quantity,0);assert.equal(after.stock.find(s=>s.venue==='pilates').quantity,1);
      const pair=after.stockMoves.filter(m=>m.transfer_id===r.id);assert.equal(pair.length,2);assert.equal(pair.reduce((n,m)=>n+m.quantity,0),0);
      assert.equal((await post(cash,{...input,requestKey:key()})).status,409);
      assert.equal((await post(cash,{...input,venue:'pilates',requestKey:key()})).status,400);
      const concurrent=await Promise.all(['calle30','calle23'].map(destination=>post(cash,{...input,venue:'pilates',destination,requestKey:key()})));
      assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
      const current=await get(cash);assert.equal(current.stock.reduce((n,r)=>n+r.quantity,0),1);
    });
    await t.test('Only owners adjust stock; negative and zero counts are rejected',async()=>{
      const input={action:'adjust',venue:'velez',productId:product,quantity:2,note:'Diferencia de conteo',requestKey:key()};
      runtime.setUser('reception');assert.equal((await post(cash,input)).status,403);runtime.setUser('owner-a');
      assert.equal((await post(cash,input)).status,200);assert.equal((await post(cash,input)).replayed,true);
      assert.equal((await post(cash,{...input,quantity:-3,requestKey:key()})).status,409);
      assert.equal((await post(cash,{...input,quantity:0,requestKey:key()})).status,400);
      assert.equal((await post(cash,{...input,quantity:-1,requestKey:key()})).status,200);
      assert.equal((await get(cash)).stock.find(s=>s.venue==='velez').quantity,1);
    });
    await t.test('Catalog edits retain sale amounts, prevent stale writes and enforce inactivity',async()=>{
      const input={action:'editProduct',productId:product,name:'Monster 473 ml',category:'Bebidas',price:3000,active:1,expectedRevision:1,requestKey:key()};
      runtime.setUser('reception');assert.equal((await post(cash,input)).status,403);runtime.setUser('owner-a');
      assert.equal((await post(cash,input)).status,200);assert.equal((await post(cash,input)).replayed,true);
      assert.equal((await post(cash,{...input,price:4000,requestKey:key()})).status,409);
      let current=await get(cash);assert.equal(current.products[0].revision,2);assert.equal(current.entries.find(e=>e.id===sale).amount,2500);assert.equal(current.productChanges.length,1);
      const saleInput={action:'sale',venue:'velez',productId:product,quantity:1,expectedPrice:2500,method:'Efectivo',requestKey:key()};
      assert.equal((await post(cash,saleInput)).status,409);
      assert.equal((await post(cash,{...input,active:0,expectedRevision:2,requestKey:key()})).status,200);
      assert.equal((await post(cash,{...saleInput,expectedPrice:3000,requestKey:key()})).status,409);
      assert.equal((await post(cash,{action:'receive',venue:'velez',productId:product,quantity:1,note:'No debe ingresar',requestKey:key()})).status,409);
      assert.equal((await post(cash,{...input,expectedRevision:3,requestKey:key()})).status,200);
      current=await get(cash);assert.equal(current.products[0].revision,4);assert.equal(current.productChanges.length,3);
    });
    await t.test('A failed catalog audit rolls price and history back',async()=>{
      await pg.exec("CREATE FUNCTION club.test_product_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('Caja: editProduct','Caja: transfer') THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER product_test_failure BEFORE INSERT ON club.audit FOR EACH ROW EXECUTE FUNCTION club.test_product_failure();");
      const before=await get(cash);
      assert.equal((await post(cash,{action:'editProduct',productId:product,name:'Changed',category:'Bebidas',price:9999,active:1,expectedRevision:4,requestKey:key()})).status,503);
      assert.equal((await post(cash,{action:'transfer',venue:'velez',destination:'pilates',productId:product,quantity:1,note:'Fallará auditoría',requestKey:key()})).status,503);
      const after=await get(cash);assert.deepEqual(after.stock,before.stock);assert.deepEqual(after.products,before.products);assert.deepEqual(after.productChanges,before.productChanges);
      await pg.exec('DROP TRIGGER product_test_failure ON club.audit; DROP FUNCTION club.test_product_failure();');
    });
    await t.test('Cash CSV exports the filtered period with readable branch names',async()=>{
      const response=await cash.GET(new Request('https://test.local/api/cash?format=csv&venue=velez&category=Productos'));
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
      const csv=await response.text();assert.match(csv,/Club Unión/);assert.doesNotMatch(csv,/Club Vélez/);assert.match(csv,/Monster/);assert.doesNotMatch(csv,/Factura limpieza/);
    });
    await t.test('Cash branch and payment-method totals reconcile with all filtered movements',async()=>{
      const data=await get(cash);
      for(const group of [data.byVenue,data.byMethod])for(const field of ['count','incoming','outgoing','balance'])assert.equal(group.reduce((n,r)=>n+r[field],0),data.summary[field]);
      const filtered=await get(cash,'?venue=pilates&category=Limpieza');assert.equal(filtered.byVenue.length,1);assert.equal(filtered.byVenue[0].venue,'pilates');assert.equal(filtered.byMethod[0].method,'Transferencia');assert.equal(filtered.byMethod[0].balance,-500);
      const empty=await get(cash,'?venue=calle23&category=Electricidad');assert.equal(empty.summary.count,0);assert.equal(empty.byVenue.length,0);assert.equal(empty.byMethod.length,0);
    });
    let correctedExpense,manualIncome;
    await t.test('Electricity expenses and manual income save with the correct signed amounts',async()=>{
      const today=(await get()).today;
      const expense={action:'expense',venue:'calle30',category:'Electricidad',concept:'Factura eléctrica de prueba',amount:500,method:'Transferencia',day:today,requestKey:key()};
      const income={action:'income',venue:'velez',concept:'Ingreso manual de prueba',amount:1000,method:'Efectivo',day:today,requestKey:key()};
      for(const payload of [expense,income]) {
        const r=await post(cash,payload);assert.equal(r.status,200,JSON.stringify(r));
        assert.equal((await post(cash,payload)).replayed,true);
        const saved=await runtime.env.DB.prepare('SELECT kind,category,amount,revision,actor FROM cash_entries WHERE id=?').bind(r.id).first();
        assert.deepEqual(saved,{kind:payload.action,category:payload.action==='expense'?'Electricidad':'Otros ingresos',amount:payload.action==='expense'?-500:1000,revision:1,actor:'owner-a'});
        if(payload.action==='expense')correctedExpense=r.id;else manualIncome=r.id;
      }
      assert.equal((await get(cash,'?venue=calle30&category=Electricidad')).summary.balance,-500);
      assert.equal((await post(cash,{...expense,day:logic.addDays(today,1),requestKey:key()})).status,400);
      assert.equal((await post(cash,{...income,amount:0,requestKey:key()})).status,400);
    });
    await t.test('Manual corrections preserve signed snapshots, operator, reason and replay history',async()=>{
      const today=(await get()).today;
      const input={action:'editEntry',id:correctedExpense,venue:'pilates',category:'Servicios',concept:'Factura corregida',amount:600,method:'Tarjeta',day:today,expectedRevision:1,reason:'Error al cargar el importe',requestKey:key()};
      runtime.setUser('reception');assert.equal((await post(cash,input)).status,403);runtime.setUser('owner-a');
      const denied=await runtime.env.DB.prepare('SELECT record_cash(?,?,?::jsonb) AS result').bind('owner-a','reception',JSON.stringify(input)).first();assert.equal(denied.result.status,403);
      assert.equal((await post(cash,input)).status,200);
      const saved=await runtime.env.DB.prepare('SELECT * FROM cash_entries WHERE id=?').bind(correctedExpense).first();
      assert.equal(saved.amount,-600);assert.equal(saved.revision,2);assert.equal(saved.actor,'owner-a');
      const history=(await get(cash)).entryChanges.filter(x=>x.cash_entry_id===correctedExpense);
      assert.equal(history.length,1);assert.equal(history[0].actor,'owner-a');assert.equal(history[0].reason,input.reason);
      const before=JSON.parse(history[0].before_state),after=JSON.parse(history[0].after_state);
      assert.deepEqual(before,{venue:'calle30',kind:'expense',category:'Electricidad',concept:'Factura eléctrica de prueba',amount:-500,method:'Transferencia',day:today,revision:1});
      assert.deepEqual(after,{venue:'pilates',kind:'expense',category:'Servicios',concept:'Factura corregida',amount:-600,method:'Tarjeta',day:today,revision:2});
      const concurrent=await Promise.all([650,700].map(amount=>post(cash,{...input,amount,expectedRevision:2,requestKey:key()})));
      assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
      assert.equal((await post(cash,input)).replayed,true,'The original retry remains valid after a newer correction');
      assert.equal((await post(cash,{...input,amount:999})).status,409);
      const current=await get(cash);assert.equal(current.entryChanges.filter(x=>x.cash_entry_id===correctedExpense).length,2);
      assert.equal(current.entries.find(x=>x.id===correctedExpense).revision,3);
      assert.equal((await post(cash,{action:'reverse',id:correctedExpense,expectedRevision:2,reason:'Pantalla antigua',requestKey:key()})).status,409);
      const reverse={action:'reverse',id:correctedExpense,expectedRevision:3,reason:'Corrección anulada de prueba',requestKey:key()};
      assert.equal((await post(cash,reverse)).status,200);assert.equal((await post(cash,reverse)).replayed,true);
      assert.equal((await post(cash,{...input,expectedRevision:3,requestKey:key()})).status,409);
      const paired=(await get(cash)).entries.filter(x=>x.id===correctedExpense||x.reverses===correctedExpense);assert.equal(paired.length,2);assert.equal(paired.reduce((n,x)=>n+x.amount,0),0);
    });
    await t.test('Corrections reject sale and membership rows and incompatible categories',async()=>{
      const input={action:'editEntry',id:manualIncome,venue:'velez',category:'Otros ingresos',concept:'Ingreso corregido',amount:1200,method:'Transferencia',day:(await get()).today,expectedRevision:1,reason:'Importe rectificado',requestKey:key()};
      assert.equal((await post(cash,{...input,category:'Electricidad'})).status,400);
      assert.equal((await post(cash,{...input,id:sale})).status,400);
      const payment=(await get()).payments[0];assert.equal((await post(cash,{...input,id:payment.id})).status,400);
      assert.equal((await post(cash,{action:'reverse',id:payment.id,expectedRevision:1,reason:'No corresponde',requestKey:key()})).status,400);
      assert.equal((await post(cash,{...input,expectedRevision:undefined})).status,400);
      assert.equal((await post(cash,input)).status,200);
      const saved=await runtime.env.DB.prepare('SELECT amount,kind,revision FROM cash_entries WHERE id=?').bind(manualIncome).first();assert.deepEqual(saved,{amount:1200,kind:'income',revision:2});
    });
    await t.test('A failed correction audit rolls back the entry and version history',async()=>{
      await pg.exec("CREATE FUNCTION club.test_entry_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='Caja: editEntry' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER entry_test_failure BEFORE INSERT ON club.audit FOR EACH ROW EXECUTE FUNCTION club.test_entry_failure();");
      const before=await get(cash);
      try {
        assert.equal((await post(cash,{action:'editEntry',id:manualIncome,venue:'calle23',category:'Otros ingresos',concept:'Corrección que falla',amount:9999,method:'Efectivo',day:(await get()).today,expectedRevision:2,reason:'Auditoría indisponible',requestKey:key()})).status,503);
        const after=await get(cash);assert.deepEqual(after.entries,before.entries);assert.deepEqual(after.entryChanges,before.entryChanges);
      } finally { await pg.exec('DROP TRIGGER entry_test_failure ON club.audit; DROP FUNCTION club.test_entry_failure();'); }
    });
    let snapshot;
    await nicoRegressions(t,{api,team,reports,exporter,offline,fiscal,terminal,logic,db:runtime.env.DB,runtime,post,get,owner:'owner-a',sqlRoleChecks:true,
      // Fixture time travel uses the harness administrator; the app role cannot
      // rewrite a signed server copy's preparation or expiration timestamps.
      fixtureSnapshotDates:(id,preparedAt,expiresAt)=>pg.query('UPDATE club.offline_snapshots SET prepared_at=$1,expires_at=$2 WHERE id=$3 AND owner=$4',[preparedAt,expiresAt,id,'owner-a']),
    });
    await t.test('JSON backup retains numeric fields and relations',async()=>{
      const response=await exporter.GET();assert.equal(response.status,200);snapshot=await response.json();assert.equal(snapshot.schemaVersion,7);
      assert.equal(snapshot.records.booking_payments.length,2);
      assert.equal(snapshot.records.cash_entry_changes.length,3);
      assert.equal(snapshot.records.cash_entries.find(x=>x.id===correctedExpense).revision,3);
      assert.equal(snapshot.records.cash_entries.find(x=>x.id===manualIncome).revision,2);
      assert.equal(snapshot.records.issuer_settings.length,1);
      assert.ok(snapshot.records.members.some(x=>x.home_branch==='calle30'));
      for(const forbidden of ['staff','offline_devices','offline_snapshots','offline_events'])assert.equal(forbidden in snapshot.records,false);
    });
    await t.test('Backup rejects incomplete transfers and invalid product history',async()=>{
      let invalid=structuredClone(snapshot);invalid.records.stock_moves=invalid.records.stock_moves.filter(m=>m.kind!=='transfer_in');
      assert.equal((await post(backup,{action:'check',requestKey:key(),backup:invalid})).status,400);
      invalid=structuredClone(snapshot);invalid.records.product_changes[0].after_state='{}';assert.equal((await post(backup,{action:'check',requestKey:key(),backup:invalid})).status,400);
    });
    await t.test('Restore uses typed JSON recordsets and remaps references',async()=>{
      clubOwner='owner-b';runtime.setOwner(clubOwner);runtime.setUser(clubOwner);
      const r=await post(backup,{action:'restore',requestKey:key(),backup:snapshot});assert.equal(r.status,200,JSON.stringify(r));
      const restored=await get();assert.equal(restored.members.length,6);assert.equal((await get(cash)).products.length,1);assert.equal((await get(cash)).stock.reduce((n,s)=>n+s.quantity,0),2);assert.equal((await get(cash)).productChanges.length,3);assert.notEqual(restored.members[0].id,member.id);
      const restoredCash=await get(cash),changes=restoredCash.entryChanges;
      assert.equal(changes.length,3);
      for(const old of snapshot.records.cash_entry_changes) {
        const match=changes.find(x=>x.created_at===old.created_at&&x.reason===old.reason&&x.after_state===old.after_state);
        assert.ok(match);assert.equal(match.actor,old.actor);assert.equal(match.before_state,old.before_state);assert.notEqual(match.cash_entry_id,old.cash_entry_id);
        assert.ok(restoredCash.entries.some(x=>x.id===match.cash_entry_id));
      }
      for(const old of snapshot.records.members)assert.equal(restored.members.find(x=>x.dni===old.dni).home_branch,old.home_branch);
      const restoredFiscal=(await get(fiscal)).settings;assert.equal(restoredFiscal.length,1);assert.equal(restoredFiscal[0].revision,2);assert.equal(restoredFiscal[0].owner,'owner-b');
      assert.deepEqual((await runtime.env.DB.prepare('SELECT id FROM offline_devices WHERE owner=?').bind('owner-b').all()).results,[]);
      const book=restored.bookings.find(b=>b.name===booking.name);assert.equal((await get(ledger,'?bookingId='+book.id)).payments.length,2);
    });
    await t.test('Redirects reject external URLs and auth loops',()=>{
      for(const url of ['https://evil.test','//evil.test','/\\evil.test','/auth/callback'])assert.equal(config.safeReturnTo(url),'/gestion');
      assert.equal(config.safeReturnTo('/jugar?day=2026-10-01'),'/jugar?day=2026-10-01');
    });
  });
} finally {await pg.close();rmSync(folder,{recursive:true,force:true});}
