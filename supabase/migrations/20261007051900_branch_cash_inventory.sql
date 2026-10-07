-- Unknown historical collecting branches remain NULL.
ALTER TABLE club.payments ADD COLUMN venue text CHECK(venue IN ('calle30','calle23','velez','pilates'));
ALTER TABLE club.booking_payments ADD COLUMN venue text CHECK(venue IN ('calle30','calle23','velez','pilates'));
CREATE TABLE club.products (
 id text PRIMARY KEY, owner text NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 category text NOT NULL, price integer NOT NULL CHECK(price BETWEEN 1 AND 10000000),
 created_at text NOT NULL, actor text NOT NULL, request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,id), UNIQUE(owner,request_key)
);
CREATE TABLE club.cash_entries (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 kind text NOT NULL CHECK(kind IN ('sale','expense','reversal')), category text NOT NULL, concept text NOT NULL,
 amount integer NOT NULL CHECK(amount<>0 AND abs(amount::bigint)<=10000000),
 method text NOT NULL CHECK(method IN ('Efectivo','Transferencia','Tarjeta')),
 day text NOT NULL CHECK(day ~ '^\d{4}-\d{2}-\d{2}$'), created_at text NOT NULL, actor text NOT NULL,
 product_id text, quantity integer CHECK(quantity>0), reverses text,
 request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,id), UNIQUE(owner,request_key), UNIQUE(owner,reverses),
 FOREIGN KEY(owner,product_id) REFERENCES club.products(owner,id),
 FOREIGN KEY(owner,reverses) REFERENCES club.cash_entries(owner,id),
 CHECK((kind='sale' AND amount>0 AND product_id IS NOT NULL AND quantity IS NOT NULL AND reverses IS NULL)
 OR (kind='expense' AND amount<0 AND product_id IS NULL AND quantity IS NULL AND reverses IS NULL)
 OR (kind='reversal' AND reverses IS NOT NULL))
);
CREATE TABLE club.stock_moves (
 id text PRIMARY KEY, owner text NOT NULL, venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
 product_id text NOT NULL, quantity integer NOT NULL CHECK(quantity<>0),
 kind text NOT NULL CHECK(kind IN ('receive','sale','reversal')), note text NOT NULL,
 actor text NOT NULL, created_at text NOT NULL, cash_entry_id text,
 request_key text NOT NULL, payload text NOT NULL, UNIQUE(owner,request_key),
 FOREIGN KEY(owner,product_id) REFERENCES club.products(owner,id),
 FOREIGN KEY(owner,cash_entry_id) REFERENCES club.cash_entries(owner,id)
);
CREATE INDEX cash_entries_owner_day ON club.cash_entries(owner,day,venue);
CREATE INDEX stock_moves_owner_product ON club.stock_moves(owner,product_id,venue);
CREATE INDEX stock_moves_cash_entry ON club.stock_moves(owner,cash_entry_id);
CREATE INDEX cash_entries_product ON club.cash_entries(owner,product_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['products','cash_entries','stock_moves'] LOOP
  EXECUTE format('ALTER TABLE club.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE club.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY club_scope ON club.%I TO gold_gym_app USING (owner=(SELECT current_setting(''app.club_owner'',true))) WITH CHECK (owner=(SELECT current_setting(''app.club_owner'',true)))',t);
  EXECUTE format('REVOKE ALL ON club.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT ON club.%I TO gold_gym_app',t);
 END LOOP;
END $$;
-- Invoker rights preserve RLS. A sale, stock debit and audit share one transaction.
CREATE FUNCTION club.record_cash(p_owner text,p_actor text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = club,pg_catalog AS $$
DECLARE
 a text := p_input->>'action'; k text := p_input->>'requestKey'; v text := p_input->>'venue';
 n integer; total integer; available bigint; prod club.products%ROWTYPE;
 original club.cash_entries%ROWTYPE; existing record;
 ident text := gen_random_uuid()::text;
 stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 d text := to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD');
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('app.club_owner',true) OR coalesce(p_actor,'')='' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF a IS NULL OR a NOT IN ('product','receive','sale','expense','reverse') OR k IS NULL OR length(k)>100 THEN RETURN jsonb_build_object('error','Operación inválida.','status',400); END IF;
 PERFORM pg_advisory_xact_lock(71946201);
 IF a='product' THEN SELECT id,payload INTO existing FROM products WHERE owner=p_owner AND request_key=k;
 ELSIF a='receive' THEN SELECT id,payload INTO existing FROM stock_moves WHERE owner=p_owner AND request_key=k;
 ELSE SELECT id,payload INTO existing FROM cash_entries WHERE owner=p_owner AND request_key=k; END IF;
 IF FOUND THEN
  IF existing.payload<>p_input::text THEN RETURN jsonb_build_object('error','Esta solicitud ya se usó con otros datos. Volvé a abrir el formulario.','status',409); END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'replayed',true);
 END IF;
 IF a='product' THEN
  INSERT INTO products VALUES(ident,p_owner,p_input->>'name',p_input->>'category',(p_input->>'price')::integer,stamp,p_actor,k,p_input::text);
 ELSIF a='reverse' THEN
  SELECT * INTO original FROM cash_entries WHERE owner=p_owner AND id=p_input->>'id';
  IF NOT FOUND OR original.kind='reversal' THEN RETURN jsonb_build_object('error','No se puede anular este movimiento.','status',400); END IF;
  IF EXISTS(SELECT 1 FROM cash_entries WHERE owner=p_owner AND reverses=original.id) THEN RETURN jsonb_build_object('error','El movimiento ya fue anulado.','status',409); END IF;
  INSERT INTO cash_entries(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,reverses,request_key,payload)
   VALUES(ident,p_owner,original.venue,'reversal',original.category,'Anulación: '||(p_input->>'reason'),-original.amount,original.method,d,stamp,p_actor,original.product_id,original.quantity,original.id,k,p_input::text);
  IF original.kind='sale' THEN INSERT INTO stock_moves VALUES(gen_random_uuid()::text,p_owner,original.venue,original.product_id,original.quantity,'reversal',p_input->>'reason',p_actor,stamp,ident,'reverse:'||k,p_input::text); END IF;
 ELSE
  IF v IS NULL OR v NOT IN ('calle30','calle23','velez','pilates') THEN RETURN jsonb_build_object('error','Elegí una sede.','status',400); END IF;
  IF a IN ('receive','sale') THEN
   n:=(p_input->>'quantity')::integer;
   IF n IS NULL OR n<1 OR n>10000 THEN RETURN jsonb_build_object('error','Cantidad inválida.','status',400); END IF;
   SELECT * INTO prod FROM products WHERE owner=p_owner AND id=p_input->>'productId';
   IF NOT FOUND THEN RETURN jsonb_build_object('error','El producto no existe.','status',404); END IF;
   IF a='receive' THEN
    INSERT INTO stock_moves VALUES(ident,p_owner,v,prod.id,n,'receive',p_input->>'note',p_actor,stamp,NULL,k,p_input::text);
   ELSE
    IF (p_input->>'expectedPrice')::integer IS DISTINCT FROM prod.price THEN RETURN jsonb_build_object('error','Cambió el precio. Actualizá antes de cobrar.','status',409); END IF;
    SELECT coalesce(sum(quantity),0) INTO available FROM stock_moves WHERE owner=p_owner AND venue=v AND product_id=prod.id;
    IF available<n THEN RETURN jsonb_build_object('error','Stock insuficiente en esta sede.','status',409); END IF;
    IF prod.price::bigint*n>10000000 THEN RETURN jsonb_build_object('error','El total supera el máximo por operación.','status',400); END IF;
    total:=prod.price*n;
    INSERT INTO cash_entries(id,owner,venue,kind,category,concept,amount,method,day,created_at,actor,product_id,quantity,request_key,payload)
     VALUES(ident,p_owner,v,'sale','Productos',prod.name||' × '||n,total,p_input->>'method',d,stamp,p_actor,prod.id,n,k,p_input::text);
    INSERT INTO stock_moves VALUES(gen_random_uuid()::text,p_owner,v,prod.id,-n,'sale','Venta',p_actor,stamp,ident,'sale:'||k,p_input::text);
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
