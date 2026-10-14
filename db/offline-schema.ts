import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
export const offlineDevices = sqliteTable("offline_devices", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), actor: text("actor").notNull(), syncKey: text("sync_key"),
  revoked: integer("revoked").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("offline_devices_owner_id").on(t.owner, t.id), index("offline_devices_owner_actor").on(t.owner, t.actor)]);
export const offlineSnapshots = sqliteTable("offline_snapshots", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), deviceId: text("device_id").notNull().references(() => offlineDevices.id),
  actor: text("actor").notNull(), venue: text("venue").notNull(), preparedAt: text("prepared_at").notNull(),
  expiresAt: text("expires_at").notNull(), entries: text("entries").notNull(),
}, t => [uniqueIndex("offline_snapshots_owner_id").on(t.owner, t.id), index("offline_snapshots_device").on(t.owner, t.deviceId, t.actor), index("offline_snapshots_expiry").on(t.owner, t.expiresAt)]);
export const offlineEvents = sqliteTable("offline_events", {
  id: text("id").notNull(), owner: text("owner").notNull(), deviceId: text("device_id").notNull().references(() => offlineDevices.id),
  snapshotId: text("snapshot_id").notNull().references(() => offlineSnapshots.id), actor: text("actor").notNull(),
  dniHash: text("dni_hash").notNull(), observedAt: text("observed_at").notNull(), receivedAt: text("received_at").notNull(),
  cachedAllowed: integer("cached_allowed").notNull(), cachedReason: text("cached_reason").notNull(),
  currentAllowed: integer("current_allowed"), currentReason: text("current_reason").notNull(), ingestKey: text("ingest_key").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.id] }), index("offline_events_received").on(t.owner, t.receivedAt), index("offline_events_device").on(t.owner,t.deviceId), index("offline_events_snapshot").on(t.owner,t.snapshotId)]);
