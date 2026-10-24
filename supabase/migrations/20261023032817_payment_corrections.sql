ALTER TABLE club.payments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE club.payments ADD COLUMN voided integer NOT NULL DEFAULT 0 CHECK(voided IN (0,1));
ALTER TABLE club.booking_payments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE club.booking_payments ADD COLUMN voided integer NOT NULL DEFAULT 0 CHECK(voided IN (0,1));
-- An annulled charge remains in history; the same balance can subsequently be charged again.
DROP INDEX club.booking_payments_kind;
CREATE UNIQUE INDEX booking_payments_kind ON club.booking_payments(owner,booking_id,kind) WHERE voided=0 AND kind='deposit';
CREATE TABLE club.payment_changes (
 id text PRIMARY KEY, owner text NOT NULL,
 source text NOT NULL CHECK(source IN ('membership','booking')), payment_id text NOT NULL,
 before_state text NOT NULL, after_state text NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 300),
 created_at text NOT NULL, actor text NOT NULL, request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,request_key)
);
CREATE INDEX payment_changes_entry ON club.payment_changes(owner,source,payment_id,created_at,id);
CREATE INDEX payment_changes_actor ON club.payment_changes(actor);
ALTER TABLE club.payment_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.payment_changes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON club.payment_changes FROM PUBLIC,anon,authenticated;
CREATE POLICY club_scope ON club.payment_changes TO gold_gym_app
 USING(owner=(SELECT current_setting('app.club_owner',true)))
 WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
-- Application code can append history, never replace or delete it.
GRANT SELECT,INSERT ON club.payment_changes TO gold_gym_app;

CREATE FUNCTION club.record_payment_change(p_owner text,p_actor text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=club,pg_catalog AS $$
DECLARE
 src text:=p_input->>'source'; act text:=p_input->>'action'; ident text:=p_input->>'id';
 request text:=p_input->>'requestKey'; reason_text text:=trim(p_input->>'reason');
 previous payment_changes%ROWTYPE; original jsonb; updated jsonb;
 booking_id_text text; booking_row bookings%ROWTYPE;
 old_amount integer; next_amount integer; next_method text; next_venue text; next_voided integer;
 delta integer; change_id text:=gen_random_uuid()::text;
 stamp text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
 PERFORM pg_advisory_xact_lock(71946201);
 IF p_owner IS DISTINCT FROM current_setting('app.club_owner',true) THEN RETURN jsonb_build_object('error','Tu acceso no permite consultar ese club.','status',403); END IF;
 PERFORM set_config('app.actor',p_actor,true),set_config('app.change_reason',coalesce(reason_text,''),true);
 IF NOT (p_actor=p_owner OR EXISTS(SELECT 1 FROM staff WHERE user_id=p_actor AND owner=p_owner AND role='owner' AND status='active')) THEN
  RETURN jsonb_build_object('error','Tu acceso no permite corregir cobros.','status',403);
 END IF;
 IF src NOT IN ('membership','booking') OR src IS NULL OR act NOT IN ('edit','void') OR act IS NULL
  OR ident IS NULL OR length(ident)>200 OR request IS NULL
  OR request !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR reason_text IS NULL OR length(reason_text) NOT BETWEEN 3 AND 300
  OR COALESCE(p_input->>'expectedRevision','') !~ '^[1-9][0-9]{0,8}$' THEN
  RETURN jsonb_build_object('error','Revisá los datos y el motivo de la corrección.','status',400);
 END IF;
 SELECT * INTO previous FROM payment_changes WHERE owner=p_owner AND request_key=request;
 IF FOUND THEN
  IF previous.payload::jsonb<>p_input THEN
   RETURN jsonb_build_object('error','La solicitud ya se usó para otra operación.','status',409);
  END IF;
  RETURN jsonb_build_object('ok',true,'id',previous.id,'replayed',true);
 END IF;
 IF src='membership' THEN
  SELECT to_jsonb(p) INTO original FROM payments p WHERE p.owner=p_owner AND p.id=ident FOR UPDATE;
 ELSE
  SELECT to_jsonb(p) INTO original FROM booking_payments p WHERE p.owner=p_owner AND p.id=ident FOR UPDATE;
 END IF;
 IF original IS NULL THEN RETURN jsonb_build_object('error','El cobro no está disponible.','status',404); END IF;
 IF (original->>'revision')::integer<>(p_input->>'expectedRevision')::integer THEN
  RETURN jsonb_build_object('error','El cobro cambió. Actualizá los datos antes de continuar.','status',409);
 END IF;
 IF (original->>'voided')::integer=1 THEN
  RETURN jsonb_build_object('error','El cobro ya fue anulado. Su historial se conserva.','status',409);
 END IF;
 old_amount:=(original->>'amount')::integer;
 next_amount:=old_amount; next_method:=original->>'method'; next_venue:=original->>'venue';
 next_voided:=CASE WHEN act='void' THEN 1 ELSE 0 END;
 IF act='edit' THEN
  IF COALESCE(p_input->>'amount','') !~ '^[0-9]{1,8}$'
   OR (p_input->>'amount')::integer>10000000
   OR (src='booking' AND (p_input->>'amount')::integer=0)
   OR COALESCE(p_input->>'method','') NOT IN ('Efectivo','Transferencia','Tarjeta')
   OR COALESCE(p_input->>'venue','') NOT IN ('calle30','calle23','velez','pilates')
   OR (src='booking' AND p_input->>'venue'<>'velez') THEN
   RETURN jsonb_build_object('error','Revisá el importe, medio de pago y sede.','status',400);
  END IF;
  next_amount:=(p_input->>'amount')::integer;
  next_method:=p_input->>'method'; next_venue:=p_input->>'venue';
  IF old_amount=next_amount AND next_method=original->>'method' AND next_venue IS NOT DISTINCT FROM original->>'venue' THEN
   RETURN jsonb_build_object('error','No hay cambios para guardar.','status',400);
  END IF;
 END IF;
 IF src='booking' THEN
  booking_id_text:=original->>'booking_id';
  SELECT * INTO booking_row FROM bookings WHERE owner=p_owner AND id=booking_id_text FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','La reserva no está disponible.','status',404); END IF;
  delta:=CASE WHEN next_voided=1 THEN 0 ELSE next_amount END-old_amount;
  IF booking_row.deposit+delta<0 OR booking_row.deposit+delta>booking_row.amount THEN
   RETURN jsonb_build_object('error','La corrección dejaría el cobro de la reserva fuera de su importe. Revisá sus cobros y el total.','status',409);
  END IF;
  UPDATE bookings SET deposit=deposit+delta WHERE owner=p_owner AND id=booking_id_text;
  UPDATE booking_payments SET amount=next_amount,method=next_method,venue=next_venue,voided=next_voided,revision=revision+1 WHERE owner=p_owner AND id=ident RETURNING to_jsonb(booking_payments.*) INTO updated;
 ELSE
  UPDATE payments SET amount=next_amount,method=next_method,venue=next_venue,voided=next_voided,revision=revision+1 WHERE owner=p_owner AND id=ident RETURNING to_jsonb(payments.*) INTO updated;
 END IF;
 INSERT INTO payment_changes(id,owner,source,payment_id,before_state,after_state,reason,created_at,actor,request_key,payload)
 VALUES(change_id,p_owner,src,ident,original::text,updated::text,reason_text,stamp,p_actor,request,p_input::text);
 INSERT INTO audit(id,owner,action,detail,created_at)
 VALUES(gen_random_uuid()::text,p_owner,CASE WHEN act='void' THEN 'Cobro anulado' ELSE 'Cobro corregido' END,
  src||' · cobro '||ident||' · antes '||jsonb_build_object('amount',old_amount,'method',original->>'method','venue',original->>'venue')::text||' · después '||jsonb_build_object('amount',next_amount,'method',next_method,'venue',next_venue,'voided',next_voided)::text||' · motivo: '||reason_text||' · operador '||p_actor,stamp);
 RETURN jsonb_build_object('ok',true,'id',change_id);
END $$;
REVOKE ALL ON FUNCTION club.record_payment_change(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION club.record_payment_change(text,text,jsonb) TO gold_gym_app;
