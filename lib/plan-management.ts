import { ClubError, type Principal } from "@/lib/server";

export type NewManagedPlan = {
  requestKey: string;
  name: string;
  price: number;
  days: number;
  accessScope: "gym" | "pilates" | "all";
  published: boolean;
};

// Recheck roles in the same serialized batch as writes. A request that started
// before its operator was revoked must not leave a plan or an audit entry.
export function livePlanActor(p: Principal, ownerOnly = false) {
  return {
    sql: `(?=? OR EXISTS(SELECT 1 FROM staff actor WHERE actor.user_id=? AND actor.owner=? AND actor.status='active' AND actor.role IN (${ownerOnly ? "'owner'" : "'owner','reception'"})))`,
    args: [p.userId, p.owner, p.userId, p.owner],
  };
}

export async function createManagedPlan(
  db: D1Database,
  p: Principal,
  input: NewManagedPlan,
) {
  const id = input.requestKey,
    auditId = `plan-create-${id}`,
    detail = JSON.stringify({
      id,
      name: input.name,
      price: input.price,
      days: input.days,
      accessScope: input.accessScope,
      published: input.published,
      actor: p.userId,
    }),
    actor = livePlanActor(p),
    now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Plan creado',?,? WHERE ${actor.sql} AND NOT EXISTS(SELECT 1 FROM audit WHERE id=?) AND NOT EXISTS(SELECT 1 FROM plans WHERE id=?)`,
    ).bind(auditId, p.owner, detail, now, ...actor.args, auditId, id),
    db.prepare(
      `INSERT INTO plans(id,owner,name,price,days,access_scope,published) SELECT ?,?,?,?,?,?,? WHERE ${actor.sql} AND EXISTS(SELECT 1 FROM audit WHERE id=? AND owner=? AND action='Plan creado' AND detail=?) AND NOT EXISTS(SELECT 1 FROM plans WHERE id=?)`,
    ).bind(id, p.owner, input.name, input.price, input.days, input.accessScope, input.published ? 1 : 0, ...actor.args, auditId, p.owner, detail, id),
    db.prepare(
      "SELECT a.detail FROM audit a JOIN plans p ON p.id=? AND p.owner=a.owner WHERE a.id=? AND a.owner=? AND a.action='Plan creado'",
    ).bind(id, auditId, p.owner),
    db.prepare(`SELECT 1 AS allowed WHERE ${actor.sql}`).bind(...actor.args),
  ]).catch(error => {
    // RLS intentionally hides plans belonging to another club. The database
    // can still reject a globally occupied request ID; keep that a generic
    // conflict after the complete batch has rolled back.
    if (error instanceof Error && /^UNIQUE constraint (?:violated|failed\b)/.test(error.message))
      throw new ClubError("Ese intento de creación ya se usó. Actualizá los planes antes de continuar.", 409);
    throw error;
  });
  if (!results[3].results.length)
    throw new ClubError("Tu acceso cambió. Volvé a cargar la pantalla antes de continuar.", 403);
  if ((results[2].results[0] as { detail?: string } | undefined)?.detail !== detail)
    throw new ClubError("Ese intento de creación ya se usó con otros datos. Actualizá los planes antes de continuar.", 409);
  return { ok: true, id, replayed: !results[1].meta.changes };
}
