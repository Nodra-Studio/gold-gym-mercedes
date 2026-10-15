import assert from 'node:assert/strict';

// Run the actual endpoints against both the SQLite compatibility adapter and
// PostgreSQL with the production RLS role. This fixture starts without seeds.
export async function planSelfServeRegressions(t, h) {
  const { api, tariffs, team, runtime, db, post, get } = h;
  const owner = 'plan-selfserve-owner', reception = 'plan-selfserve-reception', coOwner = 'plan-selfserve-co-owner';
  const useOwner = h.useOwner ?? (id => runtime.setUser(id));
  const key = () => crypto.randomUUID();
  const input = changes => ({kind:'createPlan',requestKey:key(),name:'Plan configurado por el club',price:18000,days:30,accessScope:'gym',...changes});
  const plans = async () => (await get(tariffs)).plans;
  const find = async id => (await plans()).find(p => p.id === id);
  const audits = async () => Number((await db.prepare('SELECT count(*) AS n FROM audit WHERE owner=?').bind(owner).first()).n);
  const rowCount = async (table, id) => Number((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE owner=? AND id=?`).bind(owner,id).first()).n);
  const update = (p, changes) => ({kind:'plan',id:p.id,price:p.price,published:Boolean(p.published),accessScope:p.access_scope,
    expectedPrice:p.price,expectedPublished:p.published,expectedScope:p.access_scope,...changes});
  const grant = async (userId, role, status='active') => {
    runtime.setUser(owner);
    const result = await post(team,{userId,name:'Personal de prueba '+role,role,status});
    assert.equal(result.status,200,JSON.stringify(result));
  };
  const beforeWrite = async (actor, endpoint, payload, changeActor, assertions) => {
    const original = runtime.env.DB, before = await audits();
    let interleaved = false;
    runtime.setUser(actor);
    runtime.env.DB = {...original,async batch(statements) {
      if (!interleaved && statements.some(s => /INSERT INTO plans|UPDATE plans|INSERT INTO settings/i.test(s.sql))) {
        interleaved = true;
        await changeActor();
      }
      return original.batch(statements);
    }};
    try {
      const result = await post(endpoint,payload);
      assert.equal(interleaved,true,'The fixture must interleave at the write batch');
      assert.equal(result.status,403,JSON.stringify(result));
      assert.equal(await audits(),before,'Denied operations leave no audit');
      runtime.setUser(owner);
      await assertions();
    } finally { runtime.env.DB=original;runtime.setUser(owner); }
  };
  let originalInput, primary;
  try {
    useOwner(owner);
    await t.test('Plan self-service starts with an empty real club and creates a draft without seeded prices',async()=>{
      assert.deepEqual(await plans(),[]);
      originalInput=input();
      const result=await post(tariffs,originalInput);
      assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.id,originalInput.requestKey);assert.equal(result.replayed,false);
      primary=await find(result.id);
      assert.deepEqual(primary,{id:result.id,name:originalInput.name,price:18000,days:30,access_scope:'gym',published:0});
      assert.equal((await get(api)).members.length,0);
      assert.equal(await audits(),1);
      await grant(reception,'reception');await grant(coOwner,'owner');
    });

    await t.test('Owner and reception create explicit activity scopes with canonical shared ownership',async()=>{
      runtime.setUser(reception);
      for(const accessScope of ['gym','pilates','all']) {
        const payload=input({name:'Plan de recepción '+accessScope,accessScope,published:true});
        const result=await post(tariffs,payload);assert.equal(result.status,200,JSON.stringify(result));
        const stored=await db.prepare('SELECT owner,access_scope,published FROM plans WHERE id=?').bind(result.id).first();
        assert.deepEqual({...stored},{owner,access_scope:accessScope,published:1});
      }
      const payload={action:'plan',name:'Plan desde membresías',price:12500,days:15,accessScope:'pilates',requestKey:key()};
      const created=await post(api,payload);assert.equal(created.status,200,JSON.stringify(created));
      assert.equal(created.id,payload.requestKey);assert.equal((await post(api,payload)).replayed,true);
      // Older compatible clients may omit a key and still create in the club.
      const legacy=await post(api,{action:'plan',name:'Plan compatible anterior',price:1,days:1});
      assert.equal(legacy.status,200);assert.equal((await find(legacy.id)).published,0);
      runtime.setUser(owner);
    });

    await t.test('Validation rejects malformed creation and unknown fields without plans or audits',async()=>{
      const before=await audits(), count=(await plans()).length;
      for(const changes of [{name:''},{name:'x'},{price:-1},{price:1.5},{days:0},{days:367},{accessScope:'padel'},{published:'yes'},{requestKey:'invalid'},{owner:'some-other-club'},{role:'owner'}]) {
        const result=await post(tariffs,input(changes));assert.equal(result.status,400,JSON.stringify({changes,result}));
      }
      assert.equal((await post(tariffs,{kind:'unknown'})).status,400);
      assert.equal((await plans()).length,count);assert.equal(await audits(),before);
    });

    await t.test('Non-management roles, revoked accounts and anonymous requests cannot create plans',async()=>{
      for(const role of ['gate','player']) {
        const id='plan-selfserve-'+role;await grant(id,role);runtime.setUser(id);
        assert.equal((await get(tariffs)).status,403);
        assert.equal((await post(tariffs,input())).status,403);
        assert.equal((await post(api,{action:'plan',name:'Intento sin permiso',price:1,days:30})).status,403);
      }
      await grant('plan-selfserve-revoked','reception','revoked');runtime.setUser('plan-selfserve-revoked');
      assert.equal((await post(tariffs,input())).status,403);
      runtime.setUser(null);assert.equal((await get(tariffs)).status,401);assert.equal((await post(tariffs,input())).status,401);
      runtime.setUser('plan-selfserve-unassigned');
      assert.equal((await get(tariffs)).status,runtime.supportsSitesIdentity ? 200 : 403);
      runtime.setUser(owner);
    });

    await t.test('Exact retries share one audit, and another payload cannot reuse the creation key',async()=>{
      const before=await audits();
      const replay=await post(tariffs,originalInput);assert.equal(replay.status,200);assert.equal(replay.id,primary.id);assert.equal(replay.replayed,true);
      const changed=await post(tariffs,{...originalInput,price:19000});assert.equal(changed.status,409,JSON.stringify(changed));
      assert.equal(await audits(),before);assert.equal(await rowCount('plans',primary.id),1);
      const renamed=await post(tariffs,update(primary,{name:'Nombre elegido por el club',days:45,expectedName:primary.name,expectedDays:primary.days}));
      assert.equal(renamed.status,200,JSON.stringify(renamed));primary=await find(primary.id);
      const afterEdit=await audits();
      assert.equal((await post(tariffs,originalInput)).replayed,true);
      assert.equal((await find(primary.id)).name,'Nombre elegido por el club');assert.equal((await find(primary.id)).days,45);
      assert.equal(await audits(),afterEdit,'Retry compares the original audit, not current editable plan fields');
    });

    await t.test('Simultaneous identical and conflicting creations produce one plan and one audit per key',async()=>{
      const identical=input({name:'Creación simultánea'}), before=await audits();
      const repeated=await Promise.all([post(tariffs,identical),post(tariffs,identical)]);
      assert.deepEqual(repeated.map(r=>r.status),[200,200]);assert.deepEqual(repeated.map(r=>r.replayed).sort(),[false,true]);
      assert.equal(await rowCount('plans',identical.requestKey),1);assert.equal(await audits(),before+1);
      const conflicting=input({name:'Una sola creación'});
      const raced=await Promise.all([post(tariffs,conflicting),post(tariffs,{...conflicting,days:31})]);
      assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal(await rowCount('plans',conflicting.requestKey),1);
      assert.equal(await audits(),before+2);
    });

    await t.test('Owner metadata edits use compare-and-swap and preserve previously paid dates and amounts',async()=>{
      const all=await get(api), day=all.today;
      assert.equal((await post(api,{action:'member',name:'Socio con cuota paga',dni:'88123456',phone:'',planId:primary.id,expires:day,status:'active'})).status,200);
      const member=(await get(api)).members[0];
      assert.equal((await post(api,{action:'payment',venue:'calle30',memberId:member.id,method:'Efectivo',expectedPrice:primary.price,requestKey:key()})).status,200);
      const beforeMember=(await get(api)).members[0], beforePayments=(await get(api)).payments;
      const before=await audits(), payload=update(primary,{days:20,expectedDays:primary.days,name:'Nombre actualizado',expectedName:primary.name});
      const result=await Promise.all([post(tariffs,payload),post(tariffs,{...payload,days:21})]);
      assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal(await audits(),before+1);
      assert.equal((await get(api)).members[0].expires,beforeMember.expires);assert.deepEqual((await get(api)).payments,beforePayments);
      primary=await find(primary.id);
      assert.equal((await post(tariffs,update(primary,{name:'Sin condición esperada'}))).status,409);
    });

    await t.test('Reception updates price and publication through both APIs while owner metadata stays protected',async()=>{
      runtime.setUser(reception);
      let current=await find(primary.id), before=await audits();
      for(const changes of [{name:'Cambio indebido',expectedName:current.name},{days:2,expectedDays:current.days},{accessScope:'all'}])
        assert.equal((await post(tariffs,update(current,changes))).status,403);
      assert.equal(await audits(),before);
      assert.equal((await post(tariffs,update(current,{price:21000,published:true}))).status,200);
      assert.equal((await post(tariffs,update(current,{price:22000,published:false}))).status,409);
      current=await find(primary.id);assert.equal(current.name,primary.name);assert.equal(current.days,primary.days);
      assert.equal((await post(api,{action:'planPrice',id:current.id,price:23000,expectedPrice:21000})).status,200);
      assert.equal((await post(api,{action:'planPrice',id:current.id,price:24000,expectedPrice:21000})).status,409);
      runtime.setUser(coOwner);current=await find(primary.id);
      assert.equal((await post(tariffs,update(current,{accessScope:'all'}))).status,200);
      primary=await find(primary.id);runtime.setUser(owner);
    });

    await t.test('Cross-club IDs cannot be edited, replayed or leaked into the shared club',async()=>{
      const foreignOwner='plan-selfserve-foreign-owner', foreignInput=input({name:'Plan de otro club'});
      useOwner(foreignOwner);
      const created=await post(tariffs,foreignInput);assert.equal(created.status,200,JSON.stringify(created));
      const foreign=await find(created.id);
      useOwner(owner);const before=await audits();
      assert.equal((await plans()).some(p=>p.id===foreign.id),false);
      assert.equal((await post(tariffs,update(foreign,{price:1}))).status,409);
      assert.equal((await post(api,{action:'planPrice',id:foreign.id,price:1,expectedPrice:foreign.price})).status,404);
      const collision=await post(tariffs,foreignInput);assert.equal(collision.status,409,JSON.stringify(collision));
      assert.equal(await audits(),before);
    });

    await t.test('Reception can configure padel amounts from defaults but only owners change payment contacts',async()=>{
      const base={kind:'padel',price:24000,depositPercent:50,alias:'',whatsapp:'',expectedRevision:0};
      runtime.setUser(reception);
      assert.equal((await post(tariffs,base)).status,200);
      let before=await audits();
      for(const changes of [{alias:'otro.destino'},{whatsapp:'5492324000000'}])
        assert.equal((await post(tariffs,{...base,...changes,expectedRevision:1})).status,403);
      assert.equal(await audits(),before);
      runtime.setUser(owner);
      const contacts={...base,alias:'cuenta.del.club',whatsapp:'5492324000000',expectedRevision:1};
      assert.equal((await post(tariffs,contacts)).status,200);
      runtime.setUser(reception);
      assert.equal((await post(tariffs,{...contacts,price:26000,expectedRevision:2})).status,200);
      assert.equal((await post(tariffs,{...contacts,price:27000,expectedRevision:2})).status,409);
      assert.equal((await get(tariffs)).padel.payment_alias,'cuenta.del.club');runtime.setUser(owner);
    });

    await t.test('Revoked operators cannot create or update through either endpoint and leave no audit',async()=>{
      const actor='plan-selfserve-race-reception';
      const revoke=()=>db.prepare("UPDATE staff SET status='revoked' WHERE user_id=? AND owner=?").bind(actor,owner).run();
      for(const endpoint of [tariffs,api]) {
        await grant(actor,'reception');const payload=endpoint===tariffs?input():{action:'plan',name:'Creación revocada',price:1,days:30,requestKey:key()};
        await beforeWrite(actor,endpoint,payload,revoke,async()=>assert.equal(await rowCount('plans',payload.requestKey),0));
      }
      const current=await find(primary.id);
      for(const [endpoint,payload] of [[tariffs,update(current,{price:123})],[api,{action:'planPrice',id:current.id,price:123,expectedPrice:current.price}]]) {
        await grant(actor,'reception');
        await beforeWrite(actor,endpoint,payload,revoke,async()=>assert.deepEqual(await find(current.id),current));
      }
      await grant(actor,'reception');const padel=(await get(tariffs)).padel;
      const padelPayload={kind:'padel',price:123,depositPercent:padel.deposit_percent,alias:padel.payment_alias,whatsapp:padel.whatsapp,expectedRevision:padel.revision};
      await beforeWrite(actor,tariffs,padelPayload,revoke,async()=>assert.deepEqual((await get(tariffs)).padel,padel));
    });

    await t.test('A downgraded owner cannot change plan metadata or the receiving payment account',async()=>{
      const actor='plan-selfserve-race-owner';
      const downgrade=()=>db.prepare("UPDATE staff SET role='reception' WHERE user_id=? AND owner=?").bind(actor,owner).run();
      await grant(actor,'owner');const current=await find(primary.id);
      await beforeWrite(actor,tariffs,update(current,{days:90,expectedDays:current.days}),downgrade,async()=>assert.deepEqual(await find(current.id),current));
      await grant(actor,'owner');const padel=(await get(tariffs)).padel;
      await beforeWrite(actor,tariffs,{kind:'padel',price:padel.padel_price,depositPercent:padel.deposit_percent,alias:'destino.cambiado',whatsapp:padel.whatsapp,expectedRevision:padel.revision},downgrade,
        async()=>assert.deepEqual((await get(tariffs)).padel,padel));
    });

    await t.test('An orphaned creation audit cannot recreate a plan after revocation',async()=>{
      const actor='plan-selfserve-orphan-actor';await grant(actor,'reception');runtime.setUser(actor);
      const payload=input({name:'Plan sin dependencias'});assert.equal((await post(tariffs,payload)).status,200);
      await db.prepare('DELETE FROM plans WHERE id=? AND owner=?').bind(payload.requestKey,owner).run();
      await beforeWrite(actor,tariffs,payload,()=>db.prepare("UPDATE staff SET status='revoked' WHERE user_id=? AND owner=?").bind(actor,owner).run(),
        async()=>assert.equal(await rowCount('plans',payload.requestKey),0));
    });

    await t.test('A failed plan write rolls back its audit and allows a clean retry with the same key',async()=>{
      const payload=input({name:'Creación con fallo transitorio'}), original=runtime.env.DB, before=await audits();
      runtime.env.DB={...original,async batch(statements) {
        return original.batch([...statements,original.prepare('INSERT INTO test_plan_write_failure(id) VALUES(?)').bind(payload.requestKey)]);
      }};
      try {
        assert.equal((await post(tariffs,payload)).status,503);
        assert.equal(await rowCount('plans',payload.requestKey),0);assert.equal(await audits(),before);
      } finally {runtime.env.DB=original;}
      const retry=await post(tariffs,payload);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.replayed,false);
      assert.equal(await audits(),before+1);
    });
  } finally { useOwner(h.owner);runtime.setUser(h.owner); }
}
