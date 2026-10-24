import assert from 'node:assert/strict';
export async function operationalRegressions(t,{api,team,cash,history,db,runtime,post,get,pg,offline,terminal}) {
 const key=()=>crypto.randomUUID();
 runtime.setUser('owner-a');
 const day=(await get()).today, gym=key(),pilates=key();
 await db.prepare("INSERT INTO plans(id,owner,name,price,days,access_scope) VALUES(?,'owner-a','Plan de alcance gimnasio',500,30,'gym'),(?,'owner-a','Plan de alcance Pilates',400,30,'pilates')").bind(gym,pilates).run();
 const ids={};for(const [suffix,plan,branch] of [['30',gym,'calle30'],['23',gym,'calle23'],['union',gym,'velez'],['pilates',pilates,'pilates']]){
  const id=key();ids[suffix]=id;await db.prepare("INSERT INTO members(id,owner,name,dni,phone,plan_id,status,expires,created_at,home_branch) VALUES(?,'owner-a',?,?,?,?,'active','2099-12-31',?,?)").bind(id,'Alcance '+suffix, '9811'+String(Object.keys(ids).length).padStart(4,'0'),'',plan,new Date().toISOString(),branch).run();
 }
 const grant=async(userId,activity_scope,branch_scope='all')=>{runtime.setUser('owner-a');const r=await post(team,{userId,name:userId,role:'reception',status:'active',activity_scope,branch_scope});assert.equal(r.status,200,JSON.stringify(r));runtime.setUser(userId);};
 try {
 await t.test('Reception reads and mutations are limited by gym branch and activity',async()=>{
  await grant('scope-gym30','gym','calle30');const data=await get();assert.equal(data.status,200);assert.ok(data.members.some(m=>m.id===ids['30']));assert.ok(data.members.some(m=>m.id===ids['23']));assert.ok(data.members.some(m=>m.id===ids['union']));assert.ok(!data.members.some(m=>m.id===ids['pilates']));assert.equal(data.audit.length,0);assert.equal(data.bookings.length,0);assert.equal((await get(api,'?view=padel')).status,403);
  const original=data.members.find(m=>m.id===ids['30']);const update={action:'member',id:original.id,original,name:'Nombre corregido',dni:original.dni,phone:'123456',homeBranch:'calle30',planId:original.plan_id,expires:original.expires,status:original.status,reason:'Teléfono y nombre verificados'};
  assert.equal((await post(api,update)).status,200);assert.equal((await post(api,{...update,id:ids['23']})).status,409);assert.equal((await post(api,{...update,homeBranch:'calle23'})).status,403);
  assert.equal((await post(api,{action:'access',dni:original.dni})).status,403);
  assert.equal((await post(api,{action:'session',name:'Clase ajena',day:'2099-12-01',time:'12:00',capacity:10,venue:'Pilates'})).status,403);
  const expense={action:'expense',venue:'calle30',activity:'gym',category:'Insumos',concept:'Insumos de prueba',amount:10,method:'Efectivo',day,requestKey:key()};assert.equal((await post(cash,expense)).status,200);assert.equal((await post(cash,{...expense,venue:'calle23',requestKey:key()})).status,403);assert.equal((await post(cash,{...expense,activity:'padel',venue:'velez',requestKey:key()})).status,403);
  const cashData=await get(cash);assert.equal(cashData.status,200);assert.ok(cashData.entries.every(e=>e.activity==='gym'&&e.venue==='calle30'));assert.deepEqual(cashData.entryChanges,[]);assert.ok(cashData.stock.every(s=>s.venue==='calle30'));assert.equal((await get(history)).status,403);
 });
 await t.test('Activity scope at Unión cannot leak gym via the pádel branch',async()=>{
  await grant('scope-padel','padel');const data=await get();assert.equal(data.members.length,0);assert.equal(data.payments.length,0);assert.equal((await get(api,'?view=padel')).status,200);
  const expense={action:'expense',venue:'velez',activity:'padel',category:'Mantenimiento',concept:'Mantenimiento prueba',amount:20,method:'Efectivo',day,requestKey:key()};assert.equal((await post(cash,expense)).status,200);assert.equal((await post(cash,{...expense,activity:'gym',requestKey:key()})).status,403);assert.equal((await post(cash,{...expense,activity:'unclassified',requestKey:key()})).status,403);
  const raw=await db.prepare('SELECT record_cash(?,?,?::jsonb) AS result').bind('owner-a','scope-padel',JSON.stringify({...expense,activity:'gym',requestKey:key()})).first();assert.equal(raw.result.status,403);
 });
 await t.test('Shared gym and Pilates eligibility cannot be paused or reassigned by a scoped desk',async()=>{
  runtime.setUser('owner-a');const shared=ids['union'];await db.prepare("UPDATE members SET home_branch='calle30' WHERE id=?").bind(shared).run();await db.prepare("INSERT INTO member_memberships(id,owner,member_id,plan_id,status,expires,created_at) VALUES(?,'owner-a',?,?,'active','2099-12-31',?)").bind(key(),shared,pilates,new Date().toISOString()).run();
  const combined=key();await db.prepare("INSERT INTO plans(id,owner,name,price,days,access_scope) VALUES(?,'owner-a','Plan combinado de prueba',800,30,'all')").bind(combined).run();
  await grant('scope-gym30','gym','calle30');assert.equal((await post(api,{action:'membership',memberId:ids['30'],planId:combined,status:'active',expires:'2099-12-31'})).status,403);const member=(await get()).members.find(m=>m.id===shared);assert.equal(member.profile_locked,1);assert.equal((await post(api,{action:'member',id:member.id,original:member,name:member.name,dni:member.dni,phone:member.phone,homeBranch:'calle30',planId:gym,status:'paused',expires:member.expires,reason:'Intento de pausar una ficha compartida'})).status,403);
  runtime.setUser('owner-a');assert.equal((await db.prepare('SELECT status FROM members WHERE id=?').bind(shared).first()).status,'active');
 });
 await t.test('One gym membership paid at Calle 23 admits the same client at all three gyms, online and offline',async()=>{
  runtime.setUser('owner-a');const member=await db.prepare('SELECT dni FROM members WHERE id=?').bind(ids['23']).first();const payment={action:'payment',memberId:ids['23'],venue:'calle23',method:'Efectivo',expectedPrice:500,requestKey:key()};assert.equal((await post(api,payment)).status,200);
  const expiry=(await db.prepare('SELECT expires FROM members WHERE id=?').bind(ids['23']).first()).expires;
  for(const [branch,venue] of [['calle23','Calle 23'],['velez','Club Unión'],['calle30','Calle 30']]) {
    await grant('travel-desk-'+branch,'gym',branch);
    const result=await post(api,{action:'access',dni:member.dni,venue});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.allowed,true,venue);assert.equal(result.expires,expiry,venue);
    const prepared=await post(offline,{action:'prepare',deviceId:key(),venue});assert.equal(prepared.status,200,JSON.stringify(prepared));
    const hash=await terminal.hashTerminalDni(prepared.snapshot.salt,member.dni);assert.equal(terminal.offlineDecision(prepared.snapshot,hash).allowed,true,venue+' offline');
  }
  await grant('travel-desk-calle30','gym','calle30');assert.ok((await get()).members.some(m=>m.id===ids['23']));
  assert.equal((await post(api,{...payment,venue:'calle30',requestKey:key()})).status,200);
  runtime.setUser('owner-a');const current=await db.prepare('SELECT home_branch,expires FROM members WHERE id=?').bind(ids['23']).first();assert.equal(current.home_branch,'calle23');assert.ok(current.expires>expiry);
  const renewed=(await db.prepare("SELECT venue,activity FROM payments WHERE member_id=? AND venue='calle30'").bind(ids['23']).all()).results;assert.ok(renewed.some(p=>p.activity==='gym'));
 });
 await t.test('A membership receipt keeps its activity when its collection branch or plan later changes',async()=>{
  runtime.setUser('owner-a');const member=ids['23'];const input={action:'payment',memberId:member,venue:'pilates',method:'Efectivo',expectedPrice:500,requestKey:key()};assert.equal((await post(api,input)).status,200);
  const receipt=await db.prepare("SELECT id,activity FROM payments WHERE owner='owner-a' AND request_key=?").bind(input.requestKey).first();assert.equal(receipt.activity,'gym');
  await db.prepare('UPDATE plans SET access_scope=? WHERE id=?').bind('pilates',gym).run();assert.equal((await db.prepare('SELECT activity FROM payments WHERE id=?').bind(receipt.id).first()).activity,'gym');await db.prepare('UPDATE plans SET access_scope=? WHERE id=?').bind('gym',gym).run();
 });
 await t.test('An actor scope changed after validation aborts the entire write batch',async()=>{
  await grant('scope-race','gym','calle30');const originalDB=runtime.env.DB;let fired=false;
  runtime.env.DB={prepare:originalDB.prepare.bind(originalDB),batch:async statements=>{if(!fired){fired=true;await pg.query("UPDATE club.staff SET branch_scope='calle23' WHERE user_id='scope-race'");}return originalDB.batch(statements);}};
  try {const before=await db.prepare("SELECT count(*) n FROM members WHERE owner='owner-a'").first();const r=await post(api,{action:'member',name:'No debe guardarse',dni:'98223344',phone:'',homeBranch:'calle30',planId:gym,expires:'2099-12-31',status:'active'});assert.equal(r.status,403,JSON.stringify(r));assert.equal((await db.prepare("SELECT count(*) n FROM members WHERE owner='owner-a'").first()).n,before.n);}finally{runtime.env.DB=originalDB;}
 });
 await t.test('Changing a member activity while a write is pending prevents the stale update',async()=>{
  await grant('scope-member-race','gym','calle30');const before=(await get()).members.find(m=>m.id===ids['30']);const base=runtime.env.DB;let moved=false;
  runtime.env.DB={prepare:base.prepare.bind(base),batch:async statements=>{if(!moved){moved=true;await pg.query("UPDATE club.members SET plan_id=$2 WHERE id=$1",[ids['30'],pilates]);}return base.batch(statements);}};
  try {const result=await post(api,{action:'member',id:before.id,original:before,name:'No sobreescribir otra sede',dni:before.dni,phone:before.phone,homeBranch:'calle30',planId:before.plan_id,status:before.status,expires:before.expires,reason:'Cambio desde pantalla anterior'});assert.equal(result.status,403,JSON.stringify(result));}finally{runtime.env.DB=base;await pg.query("UPDATE club.members SET plan_id=$2 WHERE id=$1",[ids['30'],gym]);runtime.setUser('owner-a');}
 });
 await t.test('A corrected partial settlement can be completed again without replacing the first charge',async()=>{
  runtime.setUser('owner-a');const next=new Date(Date.parse(day+'T12:00:00Z')+25*86400000).toISOString().slice(0,10);
  const bookingInput={action:'booking',name:'Saldo corregido de prueba',phone:'',court:4,day:next,start:480,kind:'booking',amount:200,deposit:50,depositMethod:'Efectivo',weeks:1,requestKey:key()};assert.equal((await post(api,bookingInput)).status,200);
  const booking=(await get(api,'?view=padel')).bookings.find(b=>b.name===bookingInput.name);
  assert.equal((await post(api,{action:'settleBooking',id:booking.id,expectedDeposit:50,method:'Tarjeta'})).status,200);
  const charge=await db.prepare("SELECT id,revision FROM booking_payments WHERE owner='owner-a' AND booking_id=? AND kind='settlement'").bind(booking.id).first();
  const change=await db.prepare('SELECT record_payment_change(?,?,?::jsonb) result').bind('owner-a','owner-a',JSON.stringify({action:'edit',source:'booking',id:charge.id,expectedRevision:charge.revision,amount:100,method:'Tarjeta',venue:'velez',reason:'Se cobró solo parte del saldo',requestKey:key()})).first();assert.equal(change.result.ok,true,JSON.stringify(change));
  assert.equal((await post(api,{action:'settleBooking',id:booking.id,expectedDeposit:150,method:'Efectivo'})).status,200);
  const rows=(await db.prepare("SELECT * FROM booking_payments WHERE owner='owner-a' AND booking_id=? AND voided=0").bind(booking.id).all()).results;assert.equal(rows.filter(r=>r.kind==='settlement').length,2);assert.equal(rows.reduce((sum,r)=>sum+r.amount,0),200);
 });
 await t.test('Owners see immutable before-after row history with actual operator and reason',async()=>{
  runtime.setUser('owner-a');const rows=await db.prepare("SELECT * FROM operational_changes WHERE owner='owner-a' AND entity_id=? AND operation='UPDATE' AND actor='scope-gym30' ORDER BY created_at DESC").bind(ids['30']).all();const change=rows.results[0];assert.equal(change.actor,'scope-gym30');assert.equal(change.reason,'Teléfono y nombre verificados');assert.equal(JSON.parse(change.before_state).name,'Alcance 30');assert.equal(JSON.parse(change.after_state).name,'Nombre corregido');
  await assert.rejects(db.prepare("UPDATE operational_changes SET actor='someone' WHERE owner='owner-a'").run(),/permission denied/);await assert.rejects(db.prepare("DELETE FROM operational_changes WHERE owner='owner-a'").run(),/permission denied/);
  const response=await get(history,'?from='+day+'&to='+day+'&table=members');assert.equal(response.status,200);assert.ok(response.entries.some(r=>r.entity_id===ids['30']));assert.equal((await get(history,'?table=staff;DROP TABLE members')).status,400);
 });
 }finally{runtime.setUser('owner-a');}
}
