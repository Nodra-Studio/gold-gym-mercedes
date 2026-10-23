-- Existing reception accounts retain their current access until owners assign a scope.
ALTER TABLE club.staff ADD COLUMN activity_scope text NOT NULL DEFAULT 'all' CHECK(activity_scope IN ('all','gym','padel','pilates'));
ALTER TABLE club.staff ADD COLUMN branch_scope text NOT NULL DEFAULT 'all' CHECK(branch_scope IN ('all','calle30','calle23','velez'));
ALTER TABLE club.staff ADD CONSTRAINT staff_scope_compatible CHECK(activity_scope IN ('all','gym') OR branch_scope='all');
ALTER TABLE club.cash_entries ADD COLUMN activity text NOT NULL DEFAULT 'unclassified' CHECK(activity IN ('gym','padel','pilates','unclassified'));
GRANT UPDATE(activity) ON club.cash_entries TO gold_gym_app;
CREATE FUNCTION club.staff_allows_operation(p_owner text,p_actor text,a text,v text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=club,pg_catalog AS $$
 SELECT p_owner=current_setting('app.club_owner',true) AND (p_actor=p_owner OR EXISTS(
 SELECT 1 FROM staff s WHERE s.owner=p_owner AND s.user_id=p_actor AND s.status='active' AND
 (s.role='owner' OR (s.role='reception' AND (
 (a='unclassified' AND s.activity_scope='all' AND s.branch_scope='all') OR
 ((s.activity_scope='all' OR s.activity_scope=a) AND
 ((a='gym' AND v IN ('calle30','calle23','velez') AND (s.branch_scope='all' OR s.branch_scope=v)) OR (a='padel' AND v='velez') OR (a='pilates' AND v='pilates'))))))));
$$;
CREATE FUNCTION club.staff_allows_branch(p_owner text,p_actor text,v text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=club,pg_catalog AS $$
 SELECT club.staff_allows_operation(p_owner,p_actor,'gym',v) OR club.staff_allows_operation(p_owner,p_actor,'padel',v) OR club.staff_allows_operation(p_owner,p_actor,'pilates',v);
$$;
CREATE FUNCTION club.assert_staff_scope(p_owner text,p_actor text,p_role text,p_activity text,p_branch text,p_reason text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=club,pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(71946201);
 IF p_owner IS DISTINCT FROM current_setting('app.club_owner',true) OR NOT ((p_actor=p_owner AND p_role='owner') OR EXISTS(SELECT 1 FROM staff s WHERE s.owner=p_owner AND s.user_id=p_actor AND s.status='active' AND s.role=p_role AND s.activity_scope=p_activity AND s.branch_scope=p_branch)) THEN RAISE EXCEPTION 'El acceso cambió. Volvé a cargar la pantalla.' USING ERRCODE='PT403'; END IF;
 PERFORM set_config('app.actor',p_actor,true),set_config('app.change_reason',coalesce(p_reason,''),true);
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION club.staff_allows_operation(text,text,text,text),club.staff_allows_branch(text,text,text),club.assert_staff_scope(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION club.staff_allows_operation(text,text,text,text),club.staff_allows_branch(text,text,text),club.assert_staff_scope(text,text,text,text,text,text) TO gold_gym_app;
CREATE OR REPLACE FUNCTION club.record_cash(p_owner text,p_actor text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = club,pg_catalog AS $$
DECLARE
 a text := p_input->>'action'; k text := p_input->>'requestKey'; v text := p_input->>'venue';
 n integer; total integer; available bigint; prod club.products%ROWTYPE;
 original club.cash_entries%ROWTYPE; existing record; dest text := p_input->>'destination'; previous_state text; next_state text;
 expense_categories text[] := ARRAY['Limpieza','Electricidad','Reparaciones','Mercadería','Alquiler','Servicios','Otros','Insumos','Stock','Mantenimiento','Máquinas','Socios'];
 act text := coalesce(p_input->>'activity',CASE WHEN v='pilates' THEN 'pilates' WHEN v IN ('calle30','calle23') THEN 'gym' ELSE 'unclassified' END);
 ident text := gen_random_uuid()::text;
 stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 d text := to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD');
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('app.club_owner',true) OR coalesce(p_actor,'')='' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF a IS NULL OR a NOT IN ('product','receive','sale','expense','income','reverse','transfer','adjust','editProduct','editEntry') OR k IS NULL OR length(k)>100 THEN RETURN jsonb_build_object('error','Operación inválida.','status',400); END IF;
 PERFORM pg_advisory_xact_lock(71946201);
 IF p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=p_actor AND owner=p_owner AND status='active' AND role IN ('owner','reception')) THEN RETURN jsonb_build_object('error','Tu rol no permite realizar esta acción.','status',403); END IF;
 IF a IN ('product','reverse','adjust','editProduct','editEntry') AND p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=p_actor AND owner=p_owner AND status='active' AND role='owner') THEN RETURN jsonb_build_object('error','Tu rol no permite realizar esta acción.','status',403); END IF;
 PERFORM set_config('app.actor',p_actor,true),set_config('app.change_reason',coalesce(p_input->>'reason',p_input->>'note',''),true);
 IF a IN ('sale','income','expense','editEntry') THEN
  IF act NOT IN ('gym','padel','pilates','unclassified') OR (act='gym' AND v NOT IN ('calle30','calle23','velez')) OR (act='padel' AND v<>'velez') OR (act='pilates' AND v<>'pilates') THEN RETURN jsonb_build_object('error','Revisá la actividad y la sede.','status',400); END IF;
  IF NOT club.staff_allows_operation(p_owner,p_actor,act,v) THEN RETURN jsonb_build_object('error','Tu acceso no incluye esta actividad o sede.','status',403); END IF;
 ELSIF a IN ('receive','transfer','adjust') THEN
  IF NOT club.staff_allows_branch(p_owner,p_actor,v) OR (a='transfer' AND NOT club.staff_allows_branch(p_owner,p_actor,dest)) THEN RETURN jsonb_build_object('error','Tu acceso no incluye esta sede.','status',403); END IF;
 END IF;
 IF a='product' THEN SELECT id,payload INTO existing FROM products WHERE owner=p_owner AND request_key=k;
 ELSIF a='editProduct' THEN SELECT id,payload INTO existing FROM product_changes WHERE owner=p_owner AND request_key=k;
 ELSIF a='editEntry' THEN SELECT cash_entry_id AS id,payload INTO existing FROM cash_entry_changes WHERE owner=p_owner AND request_key=k;
 ELSIF a IN ('receive','transfer','adjust') THEN SELECT id,payload INTO existing FROM stock_moves WHERE owner=p_owner AND request_key=k;
 ELSE SELECT id,payload INTO existing FROM cash_entries WHERE owner=p_owner AND request_key=k; END IF;
 IF FOUND THEN
  IF existing.payload<>p_input::text THEN RETURN jsonb_build_object('error','Esta solicitud ya se usó con otros datos. Volvé a abrir el formulario.','status',409); END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'replayed',true);
 END IF;
 IF a='product' THEN
  INSERT INTO products(id,owner,name,category,price,created_at,actor,request_key,payload) VALUES(ident,p_owner,p_input->>'name',p_input->>'category',(p_input->>'price')::integer,stamp,p_actor,k,p_input::text);
 ELSIF a='editProduct' THEN
  SELECT * INTO prod FROM products WHERE owner=p_owner AND id=p_input->>'productId';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','El producto no existe.','status',404); END IF;
  IF prod.revision IS DISTINCT FROM (p_input->>'expectedRevision')::integer THEN RETURN jsonb_build_object('error','El producto cambió en otra pantalla. Cerrá y volvé a abrir la edición.','status',409); END IF;
  previous_state:=jsonb_build_object('name',prod.name,'category',prod.category,'price',prod.price,'active',prod.active,'revision',prod.revision)::text;
  UPDATE products SET name=p_input->>'name',category=p_input->>'category',price=(p_input->>'price')::integer,active=(p_input->>'active')::integer,revision=revision+1 WHERE owner=p_owner AND id=prod.id;
  INSERT INTO product_changes(id,owner,product_id,before_state,after_state,created_at,actor,request_key,payload)
   SELECT ident,p_owner,id,previous_state,jsonb_build_object('name',name,'category',category,'price',price,'active',active,'revision',revision)::text,stamp,p_actor,k,p_input::text FROM products WHERE owner=p_owner AND id=prod.id;
 ELSIF a IN ('transfer','adjust') THEN
  IF v IS NULL OR v NOT IN ('calle30','calle23','velez','pilates') THEN RETURN jsonb_build_object('error','Elegí una sede.','status',400); END IF;
  SELECT * INTO prod FROM products WHERE owner=p_owner AND id=p_input->>'productId';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','El producto no existe.','status',404); END IF;
  n:=(p_input->>'quantity')::integer;
  IF n IS NULL OR n=0 OR abs(n::bigint)>10000 OR (a='transfer' AND n<0) THEN RETURN jsonb_build_object('error','Cantidad inválida.','status',400); END IF;
  SELECT coalesce(sum(quantity),0) INTO available FROM stock_moves WHERE owner=p_owner AND venue=v AND product_id=prod.id;
  IF a='transfer' THEN
   IF dest IS NULL OR dest NOT IN ('calle30','calle23','velez','pilates') OR dest=v THEN RETURN jsonb_build_object('error','Elegí una sede de destino diferente.','status',400); END IF;
   IF available<n THEN RETURN jsonb_build_object('error','Stock insuficiente en la sede de origen.','status',409); END IF;
   INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload,transfer_id)
    VALUES(ident,p_owner,v,prod.id,-n,'transfer_out',p_input->>'note',p_actor,stamp,NULL,k,p_input::text,ident),
    (gen_random_uuid()::text,p_owner,dest,prod.id,n,'transfer_in',p_input->>'note',p_actor,stamp,NULL,'destination:'||k,p_input::text,ident);
  ELSE
   IF available+n<0 THEN RETURN jsonb_build_object('error','El ajuste dejaría stock negativo.','status',409); END IF;
   INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload)
    VALUES(ident,p_owner,v,prod.id,n,'adjustment',p_input->>'note',p_actor,stamp,NULL,k,p_input::text);
  END IF;
 ELSIF a='editEntry' THEN
  SELECT * INTO original FROM cash_entries WHERE owner=p_owner AND id=p_input->>'id' FOR UPDATE;
  IF NOT FOUND OR original.kind NOT IN ('expense','income') THEN RETURN jsonb_build_object('error','Sólo se pueden corregir ingresos y gastos manuales. Las ventas se anulan con devolución de stock; los cobros se gestionan desde su actividad.','status',400); END IF;
  IF original.revision IS DISTINCT FROM (p_input->>'expectedRevision')::integer THEN RETURN jsonb_build_object('error','El movimiento cambió en otra pantalla. Cerrá y volvé a abrir la corrección.','status',409); END IF;
  IF EXISTS(SELECT 1 FROM cash_entries WHERE owner=p_owner AND reverses=original.id) THEN RETURN jsonb_build_object('error','El movimiento ya fue anulado y no admite correcciones.','status',409); END IF;
  IF v IS NULL OR v NOT IN ('calle30','calle23','velez','pilates') THEN RETURN jsonb_build_object('error','Elegí una sede.','status',400); END IF;
  IF (original.kind='expense' AND NOT coalesce((p_input->>'category')=ANY(expense_categories),false)) OR (original.kind='income' AND (p_input->>'category') IS DISTINCT FROM 'Otros ingresos') THEN RETURN jsonb_build_object('error','Elegí una categoría compatible con el movimiento.','status',400); END IF;
  total:=(p_input->>'amount')::integer;
  IF total IS NULL OR total<1 OR total>10000000 THEN RETURN jsonb_build_object('error','Importe inválido.','status',400); END IF;
  IF coalesce(length(trim(p_input->>'reason')),0) NOT BETWEEN 3 AND 300 OR coalesce(length(trim(p_input->>'concept')),0) NOT BETWEEN 3 AND 300 THEN RETURN jsonb_build_object('error','Completá el concepto y el motivo de corrección.','status',400); END IF;
  IF (p_input->>'day') IS NULL OR (p_input->>'day')::date>d::date THEN RETURN jsonb_build_object('error','El movimiento no puede tener fecha futura.','status',400); END IF;
  previous_state:=jsonb_build_object('activity',original.activity,'venue',original.venue,'kind',original.kind,'category',original.category,'concept',original.concept,'amount',original.amount,'method',original.method,'day',original.day,'revision',original.revision)::text;
  UPDATE cash_entries SET activity=act,venue=v,category=p_input->>'category',concept=p_input->>'concept',amount=CASE WHEN original.kind='expense' THEN -total ELSE total END,method=p_input->>'method',day=p_input->>'day',revision=revision+1 WHERE owner=p_owner AND id=original.id;
  SELECT jsonb_build_object('activity',activity,'venue',venue,'kind',kind,'category',category,'concept',concept,'amount',amount,'method',method,'day',day,'revision',revision)::text INTO next_state FROM cash_entries WHERE owner=p_owner AND id=original.id;
  INSERT INTO cash_entry_changes(id,owner,cash_entry_id,before_state,after_state,reason,created_at,actor,request_key,payload) VALUES(ident,p_owner,original.id,previous_state,next_state,p_input->>'reason',stamp,p_actor,k,p_input::text);
 ELSIF a='reverse' THEN
  SELECT * INTO original FROM cash_entries WHERE owner=p_owner AND id=p_input->>'id' FOR UPDATE;
  IF NOT FOUND OR original.kind='reversal' THEN RETURN jsonb_build_object('error','No se puede anular este movimiento.','status',400); END IF;
  IF original.revision IS DISTINCT FROM (p_input->>'expectedRevision')::integer THEN RETURN jsonb_build_object('error','El movimiento cambió en otra pantalla. Cerrá y volvé a abrir la anulación.','status',409); END IF;
  IF coalesce(length(trim(p_input->>'reason')),0) NOT BETWEEN 3 AND 300 THEN RETURN jsonb_build_object('error','Completá el motivo de anulación.','status',400); END IF;
  IF EXISTS(SELECT 1 FROM cash_entries WHERE owner=p_owner AND reverses=original.id) THEN RETURN jsonb_build_object('error','El movimiento ya fue anulado.','status',409); END IF;
  INSERT INTO cash_entries(id,owner,activity,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,reverses,request_key,payload)
   VALUES(ident,p_owner,original.activity,original.venue,'reversal',original.category,'Anulación: '||(p_input->>'reason'),-original.amount,original.method,d,stamp,p_actor,original.product_id,original.quantity,original.id,k,p_input::text);
  IF original.kind='sale' THEN INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload) VALUES(gen_random_uuid()::text,p_owner,original.venue,original.product_id,original.quantity,'reversal',p_input->>'reason',p_actor,stamp,ident,'reverse:'||k,p_input::text); END IF;
 ELSE
  IF v IS NULL OR v NOT IN ('calle30','calle23','velez','pilates') THEN RETURN jsonb_build_object('error','Elegí una sede.','status',400); END IF;
  IF a IN ('receive','sale') THEN
   n:=(p_input->>'quantity')::integer;
   IF n IS NULL OR n<1 OR n>10000 THEN RETURN jsonb_build_object('error','Cantidad inválida.','status',400); END IF;
   SELECT * INTO prod FROM products WHERE owner=p_owner AND id=p_input->>'productId';
   IF NOT FOUND THEN RETURN jsonb_build_object('error','El producto no existe.','status',404); END IF;
   IF prod.active<>1 THEN RETURN jsonb_build_object('error','El producto está inactivo. El dueño puede reactivarlo desde Editar.','status',409); END IF;
   IF a='receive' THEN
    INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload) VALUES(ident,p_owner,v,prod.id,n,'receive',p_input->>'note',p_actor,stamp,NULL,k,p_input::text);
   ELSE
    IF (p_input->>'expectedPrice')::integer IS DISTINCT FROM prod.price THEN RETURN jsonb_build_object('error','Cambió el precio. Actualizá antes de cobrar.','status',409); END IF;
    SELECT coalesce(sum(quantity),0) INTO available FROM stock_moves WHERE owner=p_owner AND venue=v AND product_id=prod.id;
    IF available<n THEN RETURN jsonb_build_object('error','Stock insuficiente en esta sede.','status',409); END IF;
    IF prod.price::bigint*n>10000000 THEN RETURN jsonb_build_object('error','El total supera el máximo por operación.','status',400); END IF;
    total:=prod.price*n;
    INSERT INTO cash_entries(id,owner,activity,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,request_key,payload)
     VALUES(ident,p_owner,act,v,'sale','Productos',prod.name||' × '||n,total,p_input->>'method',d,stamp,p_actor,prod.id,n,k,p_input::text);
    INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload) VALUES(gen_random_uuid()::text,p_owner,v,prod.id,-n,'sale','Venta',p_actor,stamp,ident,'sale:'||k,p_input::text);
   END IF;
  ELSE
   total:=(p_input->>'amount')::integer;
   IF total IS NULL OR total<1 OR total>10000000 THEN RETURN jsonb_build_object('error','Importe inválido.','status',400); END IF;
   IF a='expense' AND NOT coalesce((p_input->>'category')=ANY(expense_categories),false) THEN RETURN jsonb_build_object('error','Elegí una categoría de gasto.','status',400); END IF;
   IF (p_input->>'day') IS NULL OR (p_input->>'day')::date>d::date THEN RETURN jsonb_build_object('error','El movimiento no puede tener fecha futura.','status',400); END IF;
   INSERT INTO cash_entries(id,owner,activity,venue,kind,category,concept,amount,method,day,created_at,actor,request_key,payload)
    VALUES(ident,p_owner,act,v,a,CASE WHEN a='income' THEN 'Otros ingresos' ELSE p_input->>'category' END,p_input->>'concept',CASE WHEN a='income' THEN total ELSE -total END,p_input->>'method',p_input->>'day',stamp,p_actor,k,p_input::text);
  END IF;
 END IF;
 INSERT INTO audit(id,owner,action,detail,created_at) VALUES(gen_random_uuid()::text,p_owner,'Caja: '||a,'Movimiento '||CASE WHEN a='editEntry' THEN original.id ELSE ident END||' · operador '||p_actor||CASE WHEN a IN ('editEntry','reverse') THEN ' · motivo '||(p_input->>'reason') ELSE '' END,stamp);
 RETURN jsonb_build_object('ok',true,'id',CASE WHEN a='editEntry' THEN original.id ELSE ident END);
END $$;
REVOKE ALL ON FUNCTION club.record_cash(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION club.record_cash(text,text,jsonb) TO gold_gym_app;
