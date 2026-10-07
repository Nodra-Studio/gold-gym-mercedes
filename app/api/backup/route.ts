import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { validateBackup, backupTables } from "@/lib/backup";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    action: z.enum(["check", "restore"]),
    requestKey: z.string().uuid(),
    backup: z.unknown(),
  })
  .strict();
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const parsed = schema.safeParse(await body(req, 1500000));
    if (!parsed.success) throw new ClubError("Solicitud de respaldo inválida.");
    const input = parsed.data;
    let backup;
    try {
      backup = validateBackup(input.backup);
    } catch (e) {
      throw new ClubError(
        e instanceof Error ? e.message : "Respaldo inválido.",
      );
    }
    const counts = Object.fromEntries(
        backupTables.map((t) => [t, backup.records[t].length]),
      ),
      total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (input.action === "check")
      return Response.json(
        { valid: true, counts, total, exportedAt: backup.exportedAt },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (!total) throw new ClubError("El respaldo está vacío.");
    if (total > 5000)
      throw new ClubError(
        "La restauración desde la pantalla admite hasta 5.000 registros. Para un respaldo mayor se requiere una migración supervisada.",
      );
    const db = database(),
      previous = await db
        .prepare("SELECT request_key FROM restores WHERE owner=?")
        .bind(p.owner)
        .first<{ request_key: string }>();
    if (previous) {
      if (previous.request_key === input.requestKey)
        return Response.json({ ok: true, replayed: true, total });
      throw new ClubError(
        "Este espacio ya recibió una restauración. No se reemplazan datos desde esta pantalla.",
        409,
      );
    }
    const now = new Date().toISOString(),
      ids = new Map<string, string>();
    for (const table of backupTables)
      for (const record of backup.records[table])
        ids.set(record.id, crypto.randomUUID());
    const exists = backupTables
      .map((t) => `EXISTS(SELECT 1 FROM ${t} WHERE owner=?)`)
      .join(" OR ");
    const statements = [
      db
        .prepare(
          `INSERT INTO restores(owner,request_key,count,created_at) SELECT ?,?,?,? WHERE NOT (${exists})`,
        )
        .bind(
          p.owner,
          input.requestKey,
          total,
          now,
          ...backupTables.map(() => p.owner),
        ),
    ];
    for (const table of backupTables) {
      const records = backup.records[table].map((record) => {
        const r: Record<string, unknown> = {
          ...record,
          id: ids.get(record.id),
          owner: p.owner,
        };
        for (const key of ["plan_id", "member_id", "session_id", "booking_id", "product_id", "cash_entry_id", "reverses", "transfer_id"])
          if (typeof r[key] === "string") r[key] = ids.get(r[key] as string);
        if ("created_by" in r) r.created_by = null;
        if ("request_key" in r)
          r.request_key = "restored-" + crypto.randomUUID();
        return r;
      });
      if (!records.length) continue;
      // Column names come exclusively from validated schemas; never from arbitrary uploaded fields.
      const columns = Object.keys(records[0]);
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) SELECT ${columns.map((c) => `json_extract(value,'$.${c}')`).join(",")} FROM json_each(?) WHERE EXISTS(SELECT 1 FROM restores WHERE owner=? AND request_key=?)`,
          )
          .bind(JSON.stringify(records), p.owner, input.requestKey),
      );
    }
    if (backup.configuration) {
      const c = backup.configuration;
      statements.push(
        db
          .prepare(
            "INSERT INTO settings(owner,padel_price,booking_days,cancel_hours) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM restores WHERE owner=? AND request_key=?) ON CONFLICT(owner) DO UPDATE SET padel_price=excluded.padel_price,booking_days=excluded.booking_days,cancel_hours=excluded.cancel_hours",
          )
          .bind(
            p.owner,
            c.padel_price,
            c.booking_days,
            c.cancel_hours,
            p.owner,
            input.requestKey,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM restores WHERE owner=? AND request_key=?)",
        )
        .bind(
          crypto.randomUUID(),
          p.owner,
          "Respaldo restaurado",
          `${total} registros · exportación ${backup.exportedAt} · operador ${p.userId}`,
          now,
          p.owner,
          input.requestKey,
        ),
    );
    const result = await db.batch(statements);
    if (!result[0].meta.changes)
      throw new ClubError(
        "El espacio contiene datos. La restauración sólo se permite en un espacio vacío.",
        409,
      );
    return Response.json(
      { ok: true, total },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
