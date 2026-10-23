import { z } from "zod";
import { principal, permit, database, body, apiError, ClubError } from "@/lib/server";
import { accessForMemberships, localDay } from "@/lib/club";
import { hashTerminalDni, OFFLINE_HOURS, terminalVenues, type OfflineMembership, type OfflineSnapshot } from "@/lib/terminal-offline";

import { allowsOperation } from "@/lib/staff-scope";
import { venueActivity, venueBranch } from "@/lib/scoped-records";
import { authenticatedDatabase } from "@/lib/scoped-database";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const eventSchema = z.object({ id: uuid, snapshotId: uuid, dniHash: z.string().regex(/^[a-f0-9]{64}$/), observedAt: z.string().datetime() }).strict();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), deviceId: uuid, venue: z.enum(terminalVenues) }).strict(),
  z.object({ action: z.literal("sync"), deviceId: uuid, events: z.array(eventSchema).min(1).max(100) }).strict(),
  z.object({ action: z.literal("forget"), deviceId: uuid }).strict(),
]);
type StoredEntry = { dniHash: string; memberId: string; memberships: OfflineMembership[] };
type SnapshotRow = { id: string; device_id: string; actor: string; venue: string; prepared_at: string; expires_at: string; entries: string };
type MemberRow = OfflineMembership & { id: string; dni: string; name?: string };
const roles = ["owner", "reception", "gate"] as const;
function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
function failure(error: unknown) {
  if (error instanceof z.ZodError) return reply({ error: "Revisá los datos de la terminal." }, 400);
  return apiError(error);
}
export async function GET(req: Request) {
  try {
    const context = await principal();
    permit(context, [...roles]);
    const deviceId = z.string().uuid().optional().parse(new URL(req.url).searchParams.get("deviceId") ?? undefined);
    const device = deviceId ? await database().prepare("SELECT id FROM offline_devices WHERE id=? AND owner=? AND actor=? AND revoked=0")
      .bind(deviceId, context.owner, context.userId).first() : null;
    return reply({ userId: context.userId, deviceActive: !!device });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const context = await principal();
    permit(context, [...roles]);
    const input = schema.parse(await body(req, 40000));
    const db = authenticatedDatabase(database(),context), now = new Date(), nowText = now.toISOString();
    // principal established the canonical owner's fallback. Repeat staff state
    // in the write transaction, so revocation during request parsing takes effect.
    const authorization = "((?=1 AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=?)) OR EXISTS(SELECT 1 FROM staff WHERE user_id=? AND owner=? AND status='active' AND role IN ('owner','reception','gate')))";
    const authorizationArgs = [context.role === 'owner' && context.userId === context.owner ? 1 : 0, context.userId, context.userId, context.owner];
    const device = await db.prepare("SELECT actor,revoked FROM offline_devices WHERE id=? AND owner=?")
      .bind(input.deviceId, context.owner).first<{ actor: string; revoked: number }>();
    if (device && (device.actor !== context.userId || device.revoked))
      throw new ClubError("Esta terminal fue desactivada o pertenece a otra sesión. Borrá sus datos y preparala de nuevo.", 403);
    if (input.action === "forget") {
      if (device) await db.batch([
        db.prepare(`UPDATE offline_devices SET revoked=1,updated_at=? WHERE id=? AND owner=? AND actor=? AND ${authorization}`).bind(nowText, input.deviceId, context.owner, context.userId, ...authorizationArgs),
        db.prepare(`INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_devices WHERE id=? AND owner=? AND actor=? AND revoked=1 AND updated_at=?) AND ${authorization}`)
          .bind(crypto.randomUUID(), context.owner, "Terminal offline desactivada", `Dispositivo ${input.deviceId} · operador ${context.userId}`, nowText, input.deviceId, context.owner, context.userId, nowText, ...authorizationArgs),
      ]);
      return reply({ ok: true });
    }
    if (input.action === "prepare") {
      if (!allowsOperation(context,venueActivity(input.venue),venueBranch(input.venue)))
        throw new ClubError("Tu acceso no incluye esa terminal.",403);
      // Fetch only eligibility. Contact, prices, payments and names never enter a copy.
      const rows = await db.prepare(
        "SELECT m.id,m.dni,m.status,m.expires,p.access_scope FROM members m JOIN plans p ON p.id=m.plan_id AND p.owner=m.owner WHERE m.owner=? UNION ALL SELECT m.id,m.dni,CASE WHEN m.status='paused' THEN 'paused' ELSE mm.status END AS status,mm.expires,p.access_scope FROM members m JOIN member_memberships mm ON mm.member_id=m.id AND mm.owner=m.owner JOIN plans p ON p.id=mm.plan_id AND p.owner=mm.owner WHERE m.owner=? LIMIT 20001",
      ).bind(context.owner, context.owner).all<MemberRow>();
      if (rows.results.length > 20000) throw new ClubError("La copia supera el límite de esta terminal. Continuá el control manual en recepción.", 409);
      const salt = crypto.randomUUID(), grouped = new Map<string, { id: string; memberships: OfflineMembership[] }>();
      for (const row of rows.results) {
        const entry = grouped.get(row.dni) ?? { id: row.id, memberships: [] };
        entry.memberships.push({ status: row.status, expires: row.expires, access_scope: row.access_scope });
        grouped.set(row.dni, entry);
      }
      const entries: StoredEntry[] = await Promise.all(Array.from(grouped, async ([dni, entry]) => ({
        dniHash: await hashTerminalDni(salt, dni), memberId: entry.id, memberships: entry.memberships,
      })));
      const snapshot: OfflineSnapshot = {
        id: crypto.randomUUID(), deviceId: input.deviceId, preparedBy: context.userId,
        venue: input.venue, preparedAt: nowText, expiresAt: new Date(now.getTime() + OFFLINE_HOURS * 3600000).toISOString(),
        salt, entries: entries.map(({ dniHash, memberships }) => ({ dniHash, memberships })),
      };
      const preparationKey = crypto.randomUUID();
      await db.batch([
        db.prepare(`INSERT INTO offline_devices(id,owner,actor,revoked,updated_at,sync_key) SELECT ?,?,?,0,?,? WHERE ${authorization} ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,sync_key=excluded.sync_key WHERE offline_devices.owner=excluded.owner AND offline_devices.actor=excluded.actor AND offline_devices.revoked=0`)
          .bind(input.deviceId, context.owner, context.userId, nowText, preparationKey, ...authorizationArgs),
        db.prepare("INSERT INTO offline_snapshots(id,owner,device_id,actor,venue,prepared_at,expires_at,entries) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_devices WHERE id=? AND owner=? AND actor=? AND revoked=0 AND sync_key=?)")
          .bind(snapshot.id, context.owner, input.deviceId, context.userId, input.venue, nowText, snapshot.expiresAt, JSON.stringify(entries), input.deviceId, context.owner, context.userId, preparationKey),
        db.prepare("INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_snapshots WHERE id=? AND owner=?)")
          .bind(crypto.randomUUID(), context.owner, "Terminal offline preparada", `${input.venue} · copia hasta ${snapshot.expiresAt} · operador ${context.userId}`, nowText, snapshot.id, context.owner),
        // Remove eligibility payload after the seven-day synchronization window.
        db.prepare("UPDATE offline_snapshots SET entries='[]' WHERE owner=? AND expires_at<? AND entries<>'[]'")
          .bind(context.owner, new Date(now.getTime() - 7 * 86400000).toISOString()),
      ]);
      const saved = await db.prepare("SELECT id FROM offline_snapshots WHERE id=? AND owner=?").bind(snapshot.id, context.owner).first();
      if (!saved) throw new ClubError("La terminal fue desactivada mientras se preparaba. Borrá sus datos.", 403);
      return reply({ snapshot });
    }
    if (!device) throw new ClubError("Prepará este dispositivo con una sesión autorizada antes de sincronizar.", 403);
    if (new Set(input.events.map(e => e.id)).size !== input.events.length) throw new ClubError("La tanda contiene consultas repetidas.");
    const snapshotIds = Array.from(new Set(input.events.map(e => e.snapshotId)));
    const snapshotRows = await db.prepare(`SELECT id,device_id,actor,venue,prepared_at,expires_at,entries FROM offline_snapshots WHERE owner=? AND device_id=? AND actor=? AND id IN (${snapshotIds.map(() => "?").join(",")})`)
      .bind(context.owner, input.deviceId, context.userId, ...snapshotIds).all<SnapshotRow>();
    const copies = new Map(snapshotRows.results.map(copy => [copy.id, { ...copy, parsedEntries: JSON.parse(copy.entries) as StoredEntry[] }]));
    for (const event of input.events) {
      const copy = copies.get(event.snapshotId), observed = Date.parse(event.observedAt);
      if (copy && !allowsOperation(context,venueActivity(copy.venue),venueBranch(copy.venue)))
        throw new ClubError("Tu acceso ya no incluye la sede de esa copia. Consultá a administración.",403);
      if (!copy || now.getTime() > Date.parse(copy.expires_at) + 7 * 86400000 ||
        observed < Date.parse(copy.prepared_at) - 60000 || observed >= Date.parse(copy.expires_at) || observed > now.getTime() + 60000)
        throw new ClubError("Hay consultas fuera de la vigencia de su copia. Conservá el registro manual y consultá a administración.", 409);
    }
    const memberIds = Array.from(new Set(input.events.map(event => copies.get(event.snapshotId)!.parsedEntries.find(e => e.dniHash === event.dniHash)?.memberId).filter((id): id is string => !!id)));
    const current = memberIds.length ? (await db.prepare(
      `SELECT m.id,m.name,m.status,m.expires,p.access_scope FROM members m JOIN plans p ON p.id=m.plan_id AND p.owner=m.owner WHERE m.owner=? AND m.id IN (${memberIds.map(() => "?").join(",")}) UNION ALL SELECT m.id,m.name,CASE WHEN m.status='paused' THEN 'paused' ELSE mm.status END AS status,mm.expires,p.access_scope FROM members m JOIN member_memberships mm ON mm.member_id=m.id AND mm.owner=m.owner JOIN plans p ON p.id=mm.plan_id AND p.owner=mm.owner WHERE m.owner=? AND m.id IN (${memberIds.map(() => "?").join(",")})`,
    ).bind(context.owner, ...memberIds, context.owner, ...memberIds).all<MemberRow>()).results : [];
    // The whole batch is enabled only if every already-received UUID has the
    // identical payload. This prevents partial writes for mixed/conflicting retries.
    const syncKey = crypto.randomUUID();
    const conflicts = input.events.map(() => "(id=? AND (device_id<>? OR actor<>? OR snapshot_id<>? OR dni_hash<>? OR observed_at<>?))").join(" OR ");
    const statements: D1PreparedStatement[] = [db.prepare(
      `UPDATE offline_devices SET sync_key=?,updated_at=? WHERE id=? AND owner=? AND actor=? AND revoked=0 AND ${authorization} AND NOT EXISTS(SELECT 1 FROM offline_events WHERE owner=? AND (${conflicts}))`,
    ).bind(syncKey, nowText, input.deviceId, context.owner, context.userId, ...authorizationArgs, context.owner,
      ...input.events.flatMap(event => [event.id, input.deviceId, context.userId, event.snapshotId, event.dniHash, event.observedAt]))];
    for (const event of input.events) {
      const copy = copies.get(event.snapshotId)!, entry = copy.parsedEntries.find(e => e.dniHash === event.dniHash);
      const cached = accessForMemberships(entry?.memberships ?? [], localDay(new Date(event.observedAt)), copy.venue);
      const liveRows = current.filter(row => row.id === entry?.memberId);
      const live = entry ? accessForMemberships(liveRows, localDay(now), copy.venue) : null;
      const marker = crypto.randomUUID();
      const note = `Consulta offline · copia ${copy.prepared_at} · ${cached.reason} · estado al sincronizar: ${live?.reason ?? "DNI no incluido en la copia; sin verificación actual"} · no confirma ingreso físico`;
      statements.push(
        db.prepare("INSERT INTO offline_events(id,owner,device_id,snapshot_id,actor,dni_hash,observed_at,received_at,cached_allowed,cached_reason,current_allowed,current_reason,ingest_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_devices WHERE id=? AND owner=? AND actor=? AND revoked=0 AND sync_key=?) ON CONFLICT(owner,id) DO NOTHING")
          .bind(event.id, context.owner, input.deviceId, event.snapshotId, context.userId, event.dniHash, event.observedAt, nowText, cached.allowed ? 1 : 0, cached.reason, live ? (live.allowed ? 1 : 0) : null, live?.reason ?? "Sin verificación actual", marker, input.deviceId, context.owner, context.userId, syncKey),
        db.prepare("INSERT INTO accesses(id,owner,member_id,name,allowed,reason,venue,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_events WHERE owner=? AND id=? AND ingest_key=?)")
          .bind(event.id, context.owner, entry?.memberId ?? null, liveRows[0]?.name ?? "Consulta offline sin identificación actual", cached.allowed ? 1 : 0, note, copy.venue, event.observedAt, context.owner, event.id, marker),
        db.prepare("INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offline_events WHERE owner=? AND id=? AND ingest_key=?)")
          .bind(crypto.randomUUID(), context.owner, "Consulta offline sincronizada", `${copy.venue} · evento ${event.id} · registrado ${event.observedAt} · ${note} · operador ${context.userId}`, nowText, context.owner, event.id, marker),
      );
    }
    const synchronized = await db.batch(statements);
    if (!synchronized[0].meta.changes) {
      permit(await principal(), [...roles]);
      const active = await db.prepare("SELECT id FROM offline_devices WHERE id=? AND owner=? AND actor=? AND revoked=0").bind(input.deviceId, context.owner, context.userId).first();
      throw new ClubError(active ? "Una consulta ya fue sincronizada con otros datos. La tanda no se guardó; revisá el registro manual." : "La terminal fue desactivada. Borrá sus datos locales.", active ? 409 : 403);
    }
    const acknowledged = await db.prepare(`SELECT id,snapshot_id,dni_hash,observed_at FROM offline_events WHERE owner=? AND device_id=? AND actor=? AND id IN (${input.events.map(() => "?").join(",")})`)
      .bind(context.owner, input.deviceId, context.userId, ...input.events.map(e => e.id)).all<{ id: string; snapshot_id: string; dni_hash: string; observed_at: string }>();
    for (const row of acknowledged.results) {
      const original = input.events.find(e => e.id === row.id)!;
      if (row.snapshot_id !== original.snapshotId || row.dni_hash !== original.dniHash || row.observed_at !== original.observedAt)
        throw new ClubError("Una consulta ya fue sincronizada con otros datos. Revisá el registro manual.", 409);
    }
    if (acknowledged.results.length !== input.events.length) throw new ClubError("La terminal fue desactivada. Borrá sus datos locales.", 403);
    return reply({ acknowledged: acknowledged.results.map(row => row.id) });
  } catch (error) { return failure(error); }
}
