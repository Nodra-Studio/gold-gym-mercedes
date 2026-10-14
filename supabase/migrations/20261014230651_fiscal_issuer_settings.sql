-- Preparatory issuer data only. No credentials or fiscal documents are stored.
CREATE TABLE club.issuer_settings (
  id text PRIMARY KEY,
  owner text NOT NULL,
  venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
  legal_name text NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 2 AND 200),
  tax_id text NOT NULL CHECK(tax_id ~ '^(20|23|24|27|30|33|34)[0-9]{9}$'),
  fiscal_address text NOT NULL CHECK(length(btrim(fiscal_address)) BETWEEN 5 AND 300),
  tax_condition text NOT NULL CHECK(tax_condition IN ('registered','monotributo','exempt')),
  point_of_sale integer NOT NULL CHECK(point_of_sale BETWEEN 1 AND 99999),
  updated_at text NOT NULL,
  actor text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  UNIQUE(owner,venue),
  UNIQUE(owner,id),
  CHECK(substring(tax_id,11,1)::integer = CASE 11 - ((substring(tax_id,1,1)::integer*5+substring(tax_id,2,1)::integer*4+substring(tax_id,3,1)::integer*3+substring(tax_id,4,1)::integer*2+substring(tax_id,5,1)::integer*7+substring(tax_id,6,1)::integer*6+substring(tax_id,7,1)::integer*5+substring(tax_id,8,1)::integer*4+substring(tax_id,9,1)::integer*3+substring(tax_id,10,1)::integer*2)%11) WHEN 11 THEN 0 WHEN 10 THEN 9 ELSE 11 - ((substring(tax_id,1,1)::integer*5+substring(tax_id,2,1)::integer*4+substring(tax_id,3,1)::integer*3+substring(tax_id,4,1)::integer*2+substring(tax_id,5,1)::integer*7+substring(tax_id,6,1)::integer*6+substring(tax_id,7,1)::integer*5+substring(tax_id,8,1)::integer*4+substring(tax_id,9,1)::integer*3+substring(tax_id,10,1)::integer*2)%11) END)
);
ALTER TABLE club.issuer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.issuer_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON club.issuer_settings TO gold_gym_app
  USING (owner=(SELECT current_setting('app.club_owner',true)))
  WITH CHECK (owner=(SELECT current_setting('app.club_owner',true)));
REVOKE ALL ON club.issuer_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON club.issuer_settings TO gold_gym_app;
GRANT UPDATE(legal_name,tax_id,fiscal_address,tax_condition,point_of_sale,updated_at,actor,revision) ON club.issuer_settings TO gold_gym_app;
