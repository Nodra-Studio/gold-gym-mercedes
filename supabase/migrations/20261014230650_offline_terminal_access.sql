-- Device copies support reception's manual continuity only, never a physical gate.
SET search_path TO club, pg_catalog;
CREATE TABLE offline_devices (
  id text PRIMARY KEY,
  owner text NOT NULL,
  actor text NOT NULL,
  sync_key text,
  revoked integer NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  updated_at text NOT NULL,
  UNIQUE(owner,id)
);
CREATE TABLE offline_snapshots (
  id text PRIMARY KEY,
  owner text NOT NULL,
  device_id text NOT NULL,
  actor text NOT NULL,
  venue text NOT NULL CHECK (venue IN ('Calle 30','Calle 23','Club Unión','Pilates')),
  prepared_at text NOT NULL,
  expires_at text NOT NULL,
  entries text NOT NULL,
  UNIQUE(owner,id),
  FOREIGN KEY(owner,device_id) REFERENCES offline_devices(owner,id),
  CHECK (expires_at > prepared_at)
);
CREATE TABLE offline_events (
  id text NOT NULL,
  owner text NOT NULL,
  device_id text NOT NULL,
  snapshot_id text NOT NULL,
  actor text NOT NULL,
  dni_hash text NOT NULL,
  observed_at text NOT NULL,
  received_at text NOT NULL,
  cached_allowed integer NOT NULL CHECK (cached_allowed IN (0,1)),
  cached_reason text NOT NULL,
  current_allowed integer CHECK (current_allowed IN (0,1)),
  current_reason text NOT NULL,
  ingest_key text NOT NULL,
  PRIMARY KEY(owner,id),
  FOREIGN KEY(owner,device_id) REFERENCES offline_devices(owner,id),
  FOREIGN KEY(owner,snapshot_id) REFERENCES offline_snapshots(owner,id)
);
CREATE INDEX offline_devices_owner_actor ON offline_devices(owner,actor);
CREATE INDEX offline_snapshots_device ON offline_snapshots(owner,device_id,actor);
CREATE INDEX offline_snapshots_expiry ON offline_snapshots(owner,expires_at);
CREATE INDEX offline_events_received ON offline_events(owner,received_at);
CREATE INDEX offline_events_device ON offline_events(owner,device_id);
CREATE INDEX offline_events_snapshot ON offline_events(owner,snapshot_id);
CREATE INDEX IF NOT EXISTS member_memberships_member_fk ON member_memberships(member_id);
CREATE INDEX IF NOT EXISTS member_memberships_plan_fk ON member_memberships(plan_id);
CREATE INDEX IF NOT EXISTS payments_membership_fk ON payments(membership_id);
REVOKE ALL ON offline_devices,offline_snapshots,offline_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON offline_devices,offline_snapshots,offline_events TO gold_gym_app;
GRANT UPDATE(sync_key,updated_at,revoked) ON offline_devices TO gold_gym_app;
GRANT UPDATE(entries) ON offline_snapshots TO gold_gym_app;
ALTER TABLE offline_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON offline_devices TO gold_gym_app
  USING(owner=current_setting('app.club_owner',true)) WITH CHECK(owner=current_setting('app.club_owner',true));
ALTER TABLE offline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON offline_snapshots TO gold_gym_app
  USING(owner=current_setting('app.club_owner',true)) WITH CHECK(owner=current_setting('app.club_owner',true));
ALTER TABLE offline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_events FORCE ROW LEVEL SECURITY;
CREATE POLICY club_scope ON offline_events TO gold_gym_app
  USING(owner=current_setting('app.club_owner',true)) WITH CHECK(owner=current_setting('app.club_owner',true));
RESET search_path;
