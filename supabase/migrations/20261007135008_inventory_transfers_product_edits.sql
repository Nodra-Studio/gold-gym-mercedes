ALTER TABLE club.products ADD COLUMN active integer NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE club.products ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
GRANT UPDATE(name,category,price,active,revision) ON club.products TO gold_gym_app;
ALTER TABLE club.stock_moves DROP CONSTRAINT stock_moves_kind_check;
ALTER TABLE club.stock_moves ADD CONSTRAINT stock_moves_kind_check CHECK(kind IN ('receive','sale','reversal','transfer_out','transfer_in','adjustment'));
ALTER TABLE club.stock_moves ADD COLUMN transfer_id text;
ALTER TABLE club.stock_moves ADD CONSTRAINT stock_transfer_shape CHECK(
 (kind IN ('transfer_out','transfer_in') AND transfer_id IS NOT NULL AND cash_entry_id IS NULL AND ((kind='transfer_out' AND quantity<0) OR (kind='transfer_in' AND quantity>0)))
 OR (kind NOT IN ('transfer_out','transfer_in') AND transfer_id IS NULL));
CREATE UNIQUE INDEX stock_moves_transfer_kind ON club.stock_moves(owner,transfer_id,kind);
CREATE TABLE club.product_changes (
 id text PRIMARY KEY,owner text NOT NULL,product_id text NOT NULL,before_state text NOT NULL,after_state text NOT NULL,
 created_at text NOT NULL,actor text NOT NULL,request_key text NOT NULL,payload text NOT NULL,
 UNIQUE(owner,request_key),FOREIGN KEY(owner,product_id) REFERENCES club.products(owner,id)
);
CREATE INDEX product_changes_owner_product ON club.product_changes(owner,product_id,created_at);
ALTER TABLE club.product_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.product_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON club.product_changes TO gold_gym_app USING(owner=(SELECT current_setting('app.club_owner',true))) WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
REVOKE ALL ON club.product_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON club.product_changes TO gold_gym_app;
CREATE OR REPLACE FUNCTION club.record_cash(p_owner text,p_actor text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = club,pg_catalog AS $$
DECLARE
 a text := p_input->>'action'; k text := p_input->>'requestKey'; v text := p_input->>'venue';
 n integer; total integer; available bigint; prod club.products%ROWTYPE;
 original club.cash_entries%ROWTYPE; existing record; dest text := p_input->>'destination'; previous_state text;
 ident text := gen_random_uuid()::text;
 stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 d text := to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD');
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('app.club_owner',true) OR coalesce(p_actor,'')='' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF a IS NULL OR a NOT IN ('product','receive','sale','expense','reverse','transfer','adjust','editProduct') OR k IS NULL OR length(k)>100 THEN RETURN jsonb_build_object('error','Operación inválida.','status',400); END IF;
 PERFORM pg_advisory_xact_lock(71946201);
 IF a='product' THEN SELECT id,payload INTO existing FROM products WHERE owner=p_owner AND request_key=k;
 ELSIF a='editProduct' THEN SELECT id,payload INTO existing FROM product_changes WHERE owner=p_owner AND request_key=k;
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
 ELSIF a='reverse' THEN
  SELECT * INTO original FROM cash_entries WHERE owner=p_owner AND id=p_input->>'id';
  IF NOT FOUND OR original.kind='reversal' THEN RETURN jsonb_build_object('error','No se puede anular este movimiento.','status',400); END IF;
  IF EXISTS(SELECT 1 FROM cash_entries WHERE owner=p_owner AND reverses=original.id) THEN RETURN jsonb_build_object('error','El movimiento ya fue anulado.','status',409); END IF;
  INSERT INTO cash_entries(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,reverses,request_key,payload)
   VALUES(ident,p_owner,original.venue,'reversal',original.category,'Anulación: '||(p_input->>'reason'),-original.amount,original.method,d,stamp,p_actor,original.product_id,original.quantity,original.id,k,p_input::text);
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
    INSERT INTO cash_entries(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,request_key,payload)
     VALUES(ident,p_owner,v,'sale','Productos',prod.name||' × '||n,total,p_input->>'method',d,stamp,p_actor,prod.id,n,k,p_input::text);
    INSERT INTO stock_moves(id,owner,venue,product_id,quantity,kind,note,actor,created_at,cash_entry_id,request_key,payload) VALUES(gen_random_uuid()::text,p_owner,v,prod.id,-n,'sale','Venta',p_actor,stamp,ident,'sale:'||k,p_input::text);
   END IF;
  ELSE
   total:=(p_input->>'amount')::integer;
   IF total IS NULL OR total<1 OR total>10000000 THEN RETURN jsonb_build_object('error','Importe inválido.','status',400); END IF;
   IF (p_input->>'day')::date>d::date THEN RETURN jsonb_build_object('error','El gasto no puede tener fecha futura.','status',400); END IF;
   INSERT INTO cash_entries(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,request_key,payload)
    VALUES(ident,p_owner,v,'expense',p_input->>'category',p_input->>'concept',-total,p_input->>'method',p_input->>'day',stamp,p_actor,k,p_input::text);
  END IF;
 END IF;
 INSERT INTO audit(id,owner,action,detail,created_at) VALUES(gen_random_uuid()::text,p_owner,'Caja: '||a,'Movimiento '||ident||' · operador '||p_actor,stamp);
 RETURN jsonb_build_object('ok',true,'id',ident);
END $$;
REVOKE ALL ON FUNCTION club.record_cash(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION club.record_cash(text,text,jsonb) TO gold_gym_app;

-- Correct the branch name supplied earlier without changing financial branch IDs.
UPDATE club.accesses SET venue='Club Unión' WHERE venue IN ('Club Vélez','Unión Gold Club');
UPDATE club.sessions SET venue='Club Unión' WHERE venue IN ('Club Vélez','Unión Gold Club');
