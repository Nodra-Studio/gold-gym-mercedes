import assert from 'node:assert/strict';

// Both adapters execute the same API contract; production cash SQL has its own
// PostgreSQL cases in postgres.test.mjs.
export async function nicoRegressions(t, h) {
  const { api, team, reports, exporter, offline, fiscal, terminal, logic, db, runtime, post, get, owner } = h;
  const key = () => crypto.randomUUID();
  const snapshotDates=h.fixtureSnapshotDates??((id,preparedAt,expiresAt)=>db.prepare('UPDATE offline_snapshots SET prepared_at=?,expires_at=? WHERE id=? AND owner=?').bind(preparedAt,expiresAt,id,owner).run());
  const edit = m => ({ action:'member', id:m.id, name:m.name, dni:m.dni, phone:m.phone,
    planId:m.plan_id, status:m.status, expires:m.expires, original:m });
  runtime.setUser(owner);

  await t.test('Additional owners share the canonical club and owner permissions', async () => {
    const before = await get(api), coOwner='nico-test-co-owner';
    assert.equal((await post(team,{userId:coOwner,name:'Copropietario de prueba',role:'owner',status:'active'})).status,200);
    runtime.setUser(coOwner);
    const shared=await get(api), sharedTeam=await get(team);
    assert.equal(shared.status,200);assert.equal(shared.role,'owner');
    assert.deepEqual(shared.members,before.members);assert.deepEqual(shared.plans,before.plans);
    assert.equal(sharedTeam.role,'owner');
    assert.ok(sharedTeam.members.some(s=>s.user_id===coOwner&&s.role==='owner'));
    assert.equal((await get(reports)).status,200);
    assert.equal((await exporter.GET()).status,200);
    const plan=shared.plans[0];
    assert.equal((await post(api,{action:'planPrice',id:plan.id,price:plan.price+1,expectedPrice:plan.price})).status,200);
    assert.equal((await post(api,{action:'planPrice',id:plan.id,price:plan.price,expectedPrice:plan.price+1})).status,200);
    assert.equal((await post(team,{userId:'nico-test-reception',name:'Recepción de prueba',role:'reception',status:'active'})).status,200);
    assert.equal((await post(team,{userId:'nico-test-other-owner',name:'Segundo propietario',role:'owner',status:'active'})).status,200);
    for(const userId of [coOwner,owner])
      assert.equal((await post(team,{userId,name:'Cambio prohibido',role:'gate',status:'revoked'})).status,400);
    const stored=await db.prepare('SELECT owner FROM staff WHERE user_id=?').bind(coOwner).first();
    assert.equal(stored.owner,owner);
    assert.deepEqual((await db.prepare('SELECT id FROM plans WHERE owner=?').bind(coOwner).all()).results,[]);
    runtime.setUser(owner);
    assert.equal((await post(team,{userId:coOwner,name:'Copropietario de prueba',role:'owner',status:'revoked'})).status,200);
    runtime.setUser(coOwner);
    assert.equal((await get(api)).status,403);
    assert.equal((await post(api,{action:'seed'})).status,403);
    assert.equal((await exporter.GET()).status,403);
    assert.equal((await get(team)).role,'revoked');
    runtime.setUser(owner);
  });

  await t.test('Staff roles cannot grant themselves owner access', async () => {
    for(const role of ['reception','gate','player']) {
      const userId='nico-test-'+role;
      assert.equal((await post(team,{userId,name:'Personal '+role,role,status:'active'})).status,200);
      runtime.setUser(userId);
      assert.equal((await post(team,{userId,name:'Elevación prohibida',role:'owner',status:'active'})).status,403);
      runtime.setUser(owner);
      assert.equal((await db.prepare('SELECT role FROM staff WHERE user_id=?').bind(userId).first()).role,role);
    }
    assert.equal((await post(team,{userId:'nico-test-invalid',name:'Rol inválido',role:'administrator',status:'active'})).status,400);
    if(h.sqlRoleChecks)await assert.rejects(db.prepare('INSERT INTO staff(user_id,owner,name,role,status,created_at) VALUES(?,?,?,?,?,?)')
      .bind('nico-test-invalid',owner,'Rol inválido','administrator','active',new Date().toISOString()).run());
  });

  await t.test('Revoking an owner while their staff grant is pending prevents the grant and false audit', async () => {
    const actor='nico-test-race-owner',target='nico-test-race-target';
    assert.equal((await post(team,{userId:actor,name:'Propietario con solicitud pendiente',role:'owner',status:'active'})).status,200);
    const originalDB=runtime.env.DB;
    const before=Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n);
    let interleaved=false;
    runtime.setUser(actor);
    runtime.env.DB={...originalDB,async batch(statements) {
      if(!interleaved&&statements.some(s=>s.sql.includes('INSERT INTO staff'))) {
        interleaved=true;
        await originalDB.prepare("UPDATE staff SET status='revoked' WHERE user_id=? AND owner=?").bind(actor,owner).run();
      }
      return originalDB.batch(statements);
    }};
    try {
      const result=await post(team,{userId:target,name:'No debe existir',role:'owner',status:'active'});
      assert.equal(interleaved,true);assert.equal(result.status,403,JSON.stringify(result));
      assert.equal(await originalDB.prepare('SELECT user_id FROM staff WHERE user_id=?').bind(target).first(),null);
      assert.equal(Number((await originalDB.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n),before);
    } finally {runtime.env.DB=originalDB;runtime.setUser(owner);}
  });

  let fiscalSetting;
  const fiscalInput={venue:'calle30',legal_name:'Emisor de prueba',tax_id:'20-12345678-6',fiscal_address:'Domicilio fiscal de prueba 123',tax_condition:'registered',point_of_sale:1,expectedRevision:0};
  await t.test('Fiscal settings require owner permission and validate the CUIT and point of sale',async()=>{
    assert.deepEqual((await get(fiscal)).settings,[],'No real issuer values are filled automatically');
    for(const role of ['reception','gate','player']) {
      runtime.setUser('nico-test-'+role);
      assert.equal((await get(fiscal)).status,403);assert.equal((await post(fiscal,fiscalInput)).status,403);
    }
    runtime.setUser(owner);
    for(const changes of [{tax_id:'20123456780'},{tax_id:'abc20123456786'},{point_of_sale:0},{venue:'unknown'},{tax_condition:'other'},{role:'owner'}])
      assert.equal((await post(fiscal,{...fiscalInput,...changes})).status,400);
    const created=await post(fiscal,fiscalInput);assert.equal(created.status,200,JSON.stringify(created));fiscalSetting=created.setting;
    assert.equal(fiscalSetting.tax_id,'20123456786');assert.equal(fiscalSetting.revision,1);assert.equal(fiscalSetting.owner,owner);assert.equal(fiscalSetting.actor,owner);
  });
  await t.test('Delegated owners share fiscal records and concurrent edits keep one version and audit',async()=>{
    runtime.setUser('nico-test-other-owner');
    assert.deepEqual((await get(fiscal)).settings,[fiscalSetting]);
    const before=Number((await db.prepare("SELECT count(*) AS n FROM audit WHERE owner=? AND action='Datos fiscales actualizados'").bind(owner).first()).n);
    const results=await Promise.all([2,3].map(point_of_sale=>post(fiscal,{...fiscalInput,point_of_sale,expectedRevision:1})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    fiscalSetting=results.find(r=>r.status===200).setting;
    assert.equal(fiscalSetting.revision,2);assert.equal(fiscalSetting.actor,'nico-test-other-owner');assert.equal(fiscalSetting.owner,owner);
    assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM audit WHERE owner=? AND action='Datos fiscales actualizados'").bind(owner).first()).n),before+1);
    assert.equal((await post(fiscal,fiscalInput)).status,409);
    runtime.setUser(owner);assert.deepEqual((await get(fiscal)).settings,[fiscalSetting]);
  });
  await t.test('A failed fiscal write rolls back its preceding audit',async()=>{
    const originalDB=runtime.env.DB;
    const before=Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n);
    runtime.env.DB={...originalDB,async batch(statements) {
      return originalDB.batch([...statements,originalDB.prepare('INSERT INTO issuer_settings(id) VALUES(?)').bind(key())]);
    }};
    try {
      assert.equal((await post(fiscal,{...fiscalInput,legal_name:'Cambio que falla',expectedRevision:2})).status,503);
      assert.deepEqual((await get(fiscal)).settings,[fiscalSetting]);
      assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n),before);
    } finally {runtime.env.DB=originalDB;}
  });
  await t.test('An owner revoked during a fiscal save cannot update settings or create an audit',async()=>{
    const actor='nico-test-other-owner',originalDB=runtime.env.DB;
    const before=Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n);
    let interleaved=false;runtime.setUser(actor);
    runtime.env.DB={...originalDB,async batch(statements) {
      if(!interleaved&&statements.some(s=>s.sql.includes('INSERT INTO issuer_settings'))) {
        interleaved=true;
        await originalDB.prepare("UPDATE staff SET status='revoked' WHERE user_id=? AND owner=?").bind(actor,owner).run();
      }
      return originalDB.batch(statements);
    }};
    try {
      assert.equal((await post(fiscal,{...fiscalInput,legal_name:'Cambio no autorizado',expectedRevision:2})).status,403);
      assert.equal(interleaved,true);
      runtime.setUser(owner);assert.deepEqual((await get(fiscal)).settings,[fiscalSetting]);
      assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n),before);
    } finally {runtime.env.DB=originalDB;runtime.setUser(owner);}
  });

  await t.test('Member branches preserve historical null and reject stale branch edits without audit', async () => {
    const all=await get(api), m=all.members.find(x=>x.home_branch===null);
    assert.ok(m,'Existing members keep an explicit unassigned branch');
    const historical={...m};delete historical.home_branch;
    assert.equal((await post(api,{...edit(m),original:historical,homeBranch:'calle30'})).status,200);
    let changed=(await get(api)).members.find(x=>x.id===m.id);
    assert.equal(changed.home_branch,'calle30');
    const count=Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n);
    assert.equal((await post(api,{...edit(m),homeBranch:'pilates'})).status,409);
    assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n),count);
    assert.equal((await post(api,{...edit(changed),homeBranch:'invalid'})).status,400);
    assert.equal((await post(api,{...edit(changed),phone:changed.phone+'1'})).status,200);
    changed=(await get(api)).members.find(x=>x.id===m.id);
    assert.equal(changed.home_branch,'calle30','Omitting a branch preserves it');
    assert.equal((await post(api,{...edit(changed),homeBranch:'pilates'})).status,200);
    changed=(await get(api)).members.find(x=>x.id===m.id);
    assert.equal(changed.home_branch,'pilates');
    assert.equal((await post(api,{action:'access',dni:m.dni,venue:'Calle 23'})).status,200);
    const plan=all.plans.find(p=>p.id===m.plan_id);
    assert.equal((await post(api,{action:'payment',venue:'calle30',memberId:m.id,expectedPrice:plan.price,method:'Efectivo',requestKey:key()})).status,200);
    changed=(await get(api)).members.find(x=>x.id===m.id);
    assert.equal(changed.home_branch,'pilates','Access venue and cash venue do not reassign the member');
    assert.equal((await post(api,{...edit(changed),homeBranch:'calle30',phone:m.phone})).status,200);
  });

  await t.test('Member creation accepts a branch and leaves omitted branches unassigned', async () => {
    const data=await get(api), plan=data.plans.find(p=>p.access_scope==='gym'), ids=[];
    try {
      for(const [dni,branch] of [['98654001',undefined],['98654002','calle30']]) {
        const input={action:'member',name:'Prueba sede '+dni,dni,phone:'',planId:plan.id,status:'active',expires:logic.addDays(data.today,30),...(branch?{homeBranch:branch}:{})};
        assert.equal((await post(api,input)).status,200);
        const created=(await get(api)).members.find(m=>m.dni===dni);ids.push(created.id);
        assert.equal(created.home_branch,branch??null);
      }
    } finally {
      for(const id of ids) await db.prepare('DELETE FROM members WHERE id=? AND owner=?').bind(id,owner).run();
    }
  });

  const deviceId=key();let snapshot,event,member;
  await t.test('Offline copies expose hashes and eligibility, and restrict preparation roles', async () => {
    runtime.setUser('nico-test-player');
    assert.equal((await post(offline,{action:'prepare',deviceId:key(),venue:'Calle 30'})).status,403);
    runtime.setUser(null);
    assert.equal((await post(offline,{action:'prepare',deviceId:key(),venue:'Calle 30'})).status,401);
    for(const actor of [owner,'nico-test-reception','nico-test-gate']) {
      runtime.setUser(actor);
      const prepared=await post(offline,{action:'prepare',deviceId:actor===owner?deviceId:key(),venue:'Calle 30'});
      assert.equal(prepared.status,200,JSON.stringify(prepared));
      if(actor===owner)snapshot=prepared.snapshot;
    }
    runtime.setUser(owner);
    assert.equal(Date.parse(snapshot.expiresAt)-Date.parse(snapshot.preparedAt),8*3600000);
    assert.equal(snapshot.preparedBy,owner);assert.equal(snapshot.deviceId,deviceId);
    const data=await get(api);
    member=data.members.find(m=>m.status==='active'&&m.expires>=data.today&&data.plans.find(p=>p.id===m.plan_id)?.access_scope==='gym');
    assert.ok(member);
    const hash=await terminal.hashTerminalDni(snapshot.salt,member.dni);
    const entry=snapshot.entries.find(e=>e.dniHash===hash);assert.ok(entry);
    for(const entry of snapshot.entries) {
      assert.deepEqual(Object.keys(entry).sort(),['dniHash','memberships']);
      assert.match(entry.dniHash,/^[a-f0-9]{64}$/);
      for(const membership of entry.memberships)assert.deepEqual(Object.keys(membership).sort(),['access_scope','expires','status']);
    }
    assert.equal(JSON.stringify(snapshot).includes(member.dni),false);
    const observedAt=new Date().toISOString();
    event={id:key(),snapshotId:snapshot.id,dniHash:hash,observedAt};
  });

  await t.test('Offline sync rebuilds access from server copies and retries do not duplicate logs', async () => {
    const input={action:'sync',deviceId,events:[event]};
    for(const addition of [{allowed:true},{role:'owner'},{memberId:member.id}])
      assert.equal((await post(offline,{...input,events:[{...event,...addition}]})).status,400);
    assert.equal((await post(offline,{...input,role:'owner'})).status,400);
    await db.prepare("UPDATE members SET status='paused' WHERE id=? AND owner=?").bind(member.id,owner).run();
    try {
      const result=await post(offline,input);assert.equal(result.status,200,JSON.stringify(result));assert.deepEqual(result.acknowledged,[event.id]);
      const saved=await db.prepare('SELECT cached_allowed,current_allowed FROM offline_events WHERE owner=? AND id=?').bind(owner,event.id).first();
      const decision=terminal.offlineDecision(snapshot,event.dniHash,new Date(event.observedAt));
      assert.equal(decision.allowed,true);
      assert.equal(saved.cached_allowed,decision.allowed?1:0);assert.equal(saved.current_allowed,0);
      assert.deepEqual((await post(offline,input)).acknowledged,[event.id]);
      assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM offline_events WHERE owner=? AND id=?').bind(owner,event.id).first()).n),1);
      assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM accesses WHERE owner=? AND id=?').bind(owner,event.id).first()).n),1);
      assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM audit WHERE owner=? AND action='Consulta offline sincronizada' AND detail LIKE ?").bind(owner,'%'+event.id+'%').first()).n),1);
      assert.equal((await post(offline,{...input,events:[{...event,dniHash:'0'.repeat(64)}]})).status,409);
      const fresh={...event,id:key()};
      assert.equal((await post(offline,{...input,events:[{...event,dniHash:'0'.repeat(64)},fresh]})).status,409);
      assert.equal(await db.prepare('SELECT id FROM offline_events WHERE owner=? AND id=?').bind(owner,fresh.id).first(),null);
      const unknown={...event,id:key(),dniHash:'0'.repeat(64)};
      assert.equal((await post(offline,{...input,events:[unknown]})).status,200);
      const missing=await db.prepare('SELECT cached_allowed,current_allowed FROM offline_events WHERE owner=? AND id=?').bind(owner,unknown.id).first();
      assert.equal(missing.cached_allowed,0);assert.equal(missing.current_allowed,null);
    } finally {
      await db.prepare('UPDATE members SET status=? WHERE id=? AND owner=?').bind(member.status,member.id,owner).run();
    }
  });

  await t.test('Offline sync rejects copied devices, repeated events and expired observation windows', async () => {
    const input={action:'sync',deviceId,events:[{...event,id:key()}]};
    assert.equal((await post(offline,{...input,events:[input.events[0],input.events[0]]})).status,400);
    for(const observedAt of [new Date(Date.parse(snapshot.preparedAt)-60001).toISOString(),snapshot.expiresAt])
      assert.equal((await post(offline,{...input,events:[{...input.events[0],observedAt}]})).status,409);
    assert.equal((await post(offline,{...input,events:[{...input.events[0],snapshotId:key()}]})).status,409);
    const expiredAt=new Date(Date.now()-7*86400000-1000).toISOString(),expiredPrepared=new Date(Date.parse(expiredAt)-8*3600000).toISOString();
    await snapshotDates(snapshot.id,expiredPrepared,expiredAt);
    try {
      assert.equal((await post(offline,{...input,events:[{...input.events[0],observedAt:expiredPrepared}]})).status,409);
    } finally {await snapshotDates(snapshot.id,snapshot.preparedAt,snapshot.expiresAt);}
    runtime.setUser('nico-test-gate');
    assert.equal((await post(offline,input)).status,403);
    runtime.setUser(owner);
    assert.equal((await post(offline,{action:'forget',deviceId})).status,200);
    assert.equal((await post(offline,input)).status,403);
    assert.equal((await post(offline,{action:'prepare',deviceId,venue:'Calle 30'})).status,403);
    const receptionDevice=key();runtime.setUser('nico-test-reception');
    const prepared=await post(offline,{action:'prepare',deviceId:receptionDevice,venue:'Calle 30'});assert.equal(prepared.status,200);
    runtime.setUser(owner);
    assert.equal((await post(team,{userId:'nico-test-reception',name:'Recepción de prueba',role:'reception',status:'revoked'})).status,200);
    runtime.setUser('nico-test-reception');
    assert.equal((await post(offline,{action:'sync',deviceId:receptionDevice,events:[{...event,id:key(),snapshotId:prepared.snapshot.id}]})).status,403);
    runtime.setUser(owner);
  });
}
