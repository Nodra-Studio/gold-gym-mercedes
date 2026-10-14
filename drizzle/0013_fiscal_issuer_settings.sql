CREATE TABLE issuer_settings (
  id text PRIMARY KEY NOT NULL,
  owner text NOT NULL,
  venue text NOT NULL CHECK(venue IN ('calle30','calle23','velez','pilates')),
  legal_name text NOT NULL CHECK(length(trim(legal_name)) BETWEEN 2 AND 200),
  tax_id text NOT NULL CHECK(length(tax_id)=11 AND tax_id NOT GLOB '*[^0-9]*' AND substr(tax_id,1,2) IN ('20','23','24','27','30','33','34')),
  fiscal_address text NOT NULL CHECK(length(trim(fiscal_address)) BETWEEN 5 AND 300),
  tax_condition text NOT NULL CHECK(tax_condition IN ('registered','monotributo','exempt')),
  point_of_sale integer NOT NULL CHECK(point_of_sale BETWEEN 1 AND 99999),
  updated_at text NOT NULL,
  actor text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  UNIQUE(owner,venue),
  UNIQUE(owner,id),
  CHECK(CAST(substr(tax_id,11,1) AS integer) = CASE 11 - ((CAST(substr(tax_id,1,1) AS integer)*5+CAST(substr(tax_id,2,1) AS integer)*4+CAST(substr(tax_id,3,1) AS integer)*3+CAST(substr(tax_id,4,1) AS integer)*2+CAST(substr(tax_id,5,1) AS integer)*7+CAST(substr(tax_id,6,1) AS integer)*6+CAST(substr(tax_id,7,1) AS integer)*5+CAST(substr(tax_id,8,1) AS integer)*4+CAST(substr(tax_id,9,1) AS integer)*3+CAST(substr(tax_id,10,1) AS integer)*2)%11) WHEN 11 THEN 0 WHEN 10 THEN 9 ELSE 11 - ((CAST(substr(tax_id,1,1) AS integer)*5+CAST(substr(tax_id,2,1) AS integer)*4+CAST(substr(tax_id,3,1) AS integer)*3+CAST(substr(tax_id,4,1) AS integer)*2+CAST(substr(tax_id,5,1) AS integer)*7+CAST(substr(tax_id,6,1) AS integer)*6+CAST(substr(tax_id,7,1) AS integer)*5+CAST(substr(tax_id,8,1) AS integer)*4+CAST(substr(tax_id,9,1) AS integer)*3+CAST(substr(tax_id,10,1) AS integer)*2)%11) END)
);
