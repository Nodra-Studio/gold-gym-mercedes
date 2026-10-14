CREATE TABLE offline_devices (
 id text PRIMARY KEY NOT NULL, owner text NOT NULL, actor text NOT NULL, sync_key text,
 revoked integer DEFAULT 0 NOT NULL CHECK(revoked IN (0,1)), updated_at text NOT NULL,
 UNIQUE(owner,id)
);
--> statement-breakpoint
CREATE TABLE offline_snapshots (
 id text PRIMARY KEY NOT NULL, owner text NOT NULL, device_id text NOT NULL, actor text NOT NULL,
 venue text NOT NULL CHECK(venue IN ('Calle 30','Calle 23','Club Unión','Pilates')),
 prepared_at text NOT NULL, expires_at text NOT NULL, entries text NOT NULL, UNIQUE(owner,id),
 FOREIGN KEY(owner,device_id) REFERENCES offline_devices(owner,id), CHECK(expires_at>prepared_at)
);
--> statement-breakpoint
CREATE TABLE offline_events (
 id text NOT NULL, owner text NOT NULL, device_id text NOT NULL, snapshot_id text NOT NULL,
 actor text NOT NULL, dni_hash text NOT NULL, observed_at text NOT NULL, received_at text NOT NULL,
 cached_allowed integer NOT NULL CHECK(cached_allowed IN (0,1)), cached_reason text NOT NULL,
 current_allowed integer CHECK(current_allowed IN (0,1)), current_reason text NOT NULL, ingest_key text NOT NULL,
 PRIMARY KEY(owner,id), FOREIGN KEY(owner,device_id) REFERENCES offline_devices(owner,id),
 FOREIGN KEY(owner,snapshot_id) REFERENCES offline_snapshots(owner,id)
);
--> statement-breakpoint
CREATE INDEX offline_devices_owner_actor ON offline_devices(owner,actor);
--> statement-breakpoint
CREATE INDEX offline_snapshots_device ON offline_snapshots(owner,device_id,actor);
--> statement-breakpoint
CREATE INDEX offline_snapshots_expiry ON offline_snapshots(owner,expires_at);
--> statement-breakpoint
CREATE INDEX offline_events_received ON offline_events(owner,received_at);
--> statement-breakpoint
CREATE INDEX offline_events_device ON offline_events(owner,device_id);
--> statement-breakpoint
CREATE INDEX offline_events_snapshot ON offline_events(owner,snapshot_id);
