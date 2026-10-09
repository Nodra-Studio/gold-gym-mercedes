ALTER TABLE plans ADD COLUMN published integer NOT NULL DEFAULT 0 CHECK(published IN (0,1));
ALTER TABLE settings ADD COLUMN deposit_percent integer NOT NULL DEFAULT 0 CHECK(deposit_percent BETWEEN 0 AND 100);
ALTER TABLE settings ADD COLUMN payment_alias text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN whatsapp text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN price_published integer NOT NULL DEFAULT 0 CHECK(price_published IN (0,1));
ALTER TABLE booking_requests ADD COLUMN deposit_expected integer NOT NULL DEFAULT 0;
ALTER TABLE booking_requests ADD COLUMN payment_method text NOT NULL DEFAULT 'Transferencia';
CREATE TABLE member_memberships (
 id text PRIMARY KEY, owner text NOT NULL, member_id text NOT NULL REFERENCES members(id), plan_id text NOT NULL REFERENCES plans(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')), expires text NOT NULL, created_at text NOT NULL,
 UNIQUE(owner,member_id,plan_id)
);
CREATE INDEX member_memberships_member ON member_memberships(owner,member_id);
ALTER TABLE payments ADD COLUMN membership_id text REFERENCES member_memberships(id);
