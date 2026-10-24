ALTER TABLE payments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE payments ADD COLUMN voided integer NOT NULL DEFAULT 0 CHECK(voided IN (0,1));
ALTER TABLE booking_payments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE booking_payments ADD COLUMN voided integer NOT NULL DEFAULT 0 CHECK(voided IN (0,1));
DROP INDEX booking_payments_kind;
CREATE UNIQUE INDEX booking_payments_kind ON booking_payments(owner,booking_id,kind) WHERE voided=0 AND kind='deposit';
CREATE TABLE payment_changes (
 id text PRIMARY KEY, owner text NOT NULL,
 source text NOT NULL CHECK(source IN ('membership','booking')), payment_id text NOT NULL,
 before_state text NOT NULL, after_state text NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 300),
 created_at text NOT NULL, actor text NOT NULL, request_key text NOT NULL, payload text NOT NULL,
 UNIQUE(owner,request_key)
);
CREATE INDEX payment_changes_entry ON payment_changes(owner,source,payment_id,created_at,id);
CREATE INDEX payment_changes_actor ON payment_changes(actor);
