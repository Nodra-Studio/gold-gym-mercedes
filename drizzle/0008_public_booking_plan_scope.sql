ALTER TABLE plans ADD COLUMN access_scope text NOT NULL DEFAULT 'gym' CHECK(access_scope IN ('gym','pilates','all'));
UPDATE plans SET access_scope='pilates' WHERE lower(name) LIKE '%pilates%';
CREATE TABLE booking_requests (
 id text PRIMARY KEY, owner text NOT NULL, court integer NOT NULL CHECK(court BETWEEN 1 AND 4),
 day text NOT NULL, start integer NOT NULL, name text NOT NULL, phone text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
 amount integer NOT NULL, receipt text NOT NULL DEFAULT '', receipt_type text NOT NULL DEFAULT '',
 request_key text NOT NULL, created_at text NOT NULL, booking_id text,
 UNIQUE(owner,request_key)
);
CREATE INDEX booking_requests_queue ON booking_requests(owner,status,day);
