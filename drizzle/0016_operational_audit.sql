-- Operational PostgreSQL triggers capture row history. This table preserves portable backups.
CREATE TABLE operational_changes (
 id text PRIMARY KEY,owner text NOT NULL,table_name text NOT NULL,entity_id text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 before_state text,after_state text,actor text,reason text,created_at text NOT NULL
);
CREATE INDEX operational_changes_owner_created ON operational_changes(owner,created_at DESC,id DESC);
