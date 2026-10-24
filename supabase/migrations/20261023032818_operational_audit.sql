-- Append-only row history, in the same transaction as the operation it records.
CREATE TABLE club.operational_changes (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 owner text NOT NULL, table_name text NOT NULL, entity_id text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 before_state text, after_state text, actor text, reason text,
 created_at text NOT NULL
);
CREATE INDEX operational_changes_owner_created ON club.operational_changes(owner,created_at DESC,id DESC);
CREATE INDEX operational_changes_owner_entity ON club.operational_changes(owner,table_name,entity_id,created_at);
ALTER TABLE club.operational_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.operational_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON club.operational_changes TO gold_gym_app USING(owner=(SELECT current_setting('app.club_owner',true))) WITH CHECK(owner=(SELECT current_setting('app.club_owner',true)));
REVOKE ALL ON club.operational_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON club.operational_changes TO gold_gym_app;
CREATE FUNCTION club.capture_operational_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=club,pg_catalog AS $$
DECLARE old_row jsonb; new_row jsonb; record_owner text; ident text; who text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF old_row IS NOT DISTINCT FROM new_row THEN RETURN NULL; END IF;
 record_owner:=coalesce(new_row->>'owner',old_row->>'owner');
 ident:=coalesce(new_row->>'id',new_row->>'user_id',old_row->>'id',old_row->>'user_id',record_owner);
 who:=coalesce(nullif(current_setting('app.actor',true),''),new_row->>'actor',new_row->>'created_by',old_row->>'actor');
 INSERT INTO operational_changes(owner,table_name,entity_id,operation,before_state,after_state,actor,reason,created_at)
 VALUES(record_owner,TG_TABLE_NAME,ident,TG_OP,old_row::text,new_row::text,who,nullif(current_setting('app.change_reason',true),''),to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION club.capture_operational_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION club.capture_operational_change() TO gold_gym_app;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['staff','members','plans','member_memberships','payments','bookings','booking_payments','sessions','enrollments','products','cash_entries','stock_moves','settings','issuer_settings'] LOOP
  EXECUTE format('CREATE TRIGGER operational_history AFTER INSERT OR UPDATE OR DELETE ON club.%I FOR EACH ROW EXECUTE FUNCTION club.capture_operational_change()',t);
 END LOOP;
END $$;
