import { authenticatedDatabase } from "@/lib/scoped-database";
import { supportsSitesIdentity, ownerAccount } from "@club/runtime";
import { z } from "zod";
import { staffActivities, staffBranches, unrestrictedScope } from "@/lib/staff-scope";
import {
  identity,
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
export const dynamic = "force-dynamic";
const inputSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["owner", "reception", "gate", "player"]),
  status: z.enum(["active", "revoked"]),
  activity_scope: z.enum(staffActivities).default("all"),
  branch_scope: z.enum(staffBranches).default("all"),
  reason: z.string().trim().min(3).max(300).default("Configuración de acceso del equipo"),
});
export async function GET() {
  try {
    const userId = await identity(),
      db = database();
    const membership = await db
      .prepare("SELECT owner,role,status,activity_scope,branch_scope FROM staff WHERE user_id=?")
      .bind(userId)
      .first<{ owner: string; role: string; status: string; activity_scope: string; branch_scope: string }>();
    if (membership && (membership.status !== "active" || membership.role !== "owner"))
      return Response.json(
        {
          userId,
          authProvider: supportsSitesIdentity ? "sites" : "supabase",
          role: membership.status === "active" && ["reception", "gate", "player"].includes(membership.role) ? membership.role : "revoked",
          members: [],
          activity_scope: membership.activity_scope,
          branch_scope: membership.branch_scope,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (!membership && !supportsSitesIdentity && !ownerAccount(userId))
      return Response.json({ userId, role: "pending", members: [], authProvider: "supabase" }, { headers: { "Cache-Control": "no-store" } });
    // A delegated owner uses the club's original dataset, never a new space
    // keyed by their own account. The membership is checked on every request.
    const p = await principal();
    permit(p, ["owner"]);
    const result = await db
      .prepare(
        "SELECT user_id,name,role,status,activity_scope,branch_scope,created_at FROM staff WHERE owner=? ORDER BY name",
      )
      .bind(p.owner)
      .all();
    return Response.json(
      { userId, role: "owner", ...unrestrictedScope, members: result.results, authProvider: supportsSitesIdentity ? "sites" : "supabase" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const parsed = inputSchema.safeParse(await body(req));
    if (!parsed.success)
      throw new ClubError("Revisá el identificador, nombre y rol.");
    const input = parsed.data,
      db = authenticatedDatabase(database(),p,input.reason);
    if (input.role !== "reception") Object.assign(input, unrestrictedScope);
    if (!["all", "gym"].includes(input.activity_scope) && input.branch_scope !== "all")
      throw new ClubError("La sede de gimnasio sólo se aplica a recepción general o de gimnasio.");
    if (input.userId === p.userId || input.userId === p.owner || ownerAccount(input.userId))
      throw new ClubError(
        "No podés cambiar tu propio acceso ni el de la cuenta principal del club.",
      );
    const existing = await db
      .prepare("SELECT owner FROM staff WHERE user_id=?")
      .bind(input.userId)
      .first<{ owner: string }>();
    if (existing && existing.owner !== p.owner)
      throw new ClubError("Esa cuenta ya pertenece a otro espacio.", 409);
    const hasOwnSpace = await db
      .prepare(
        "SELECT id FROM plans WHERE owner=? UNION ALL SELECT user_id AS id FROM staff WHERE owner=? LIMIT 1",
      )
      .bind(input.userId, input.userId)
      .first();
    if (hasOwnSpace)
      throw new ClubError(
        "Esa cuenta ya administra un espacio. Usá una cuenta del personal sin datos propios.",
        409,
      );
    const now = new Date().toISOString();
    // Recheck the acting owner's membership inside the serialized write batch.
    // A request that began before revocation must not enable another account.
    const authorization = "(?=? OR EXISTS(SELECT 1 FROM staff actor WHERE actor.user_id=? AND actor.owner=? AND actor.role='owner' AND actor.status='active'))";
    const authorizationArgs = [p.userId, p.owner, p.userId, p.owner];
    // The previous values are read inside the same serialized write batch as
    // the update, so concurrent edits record the actual transition.
    const result = await db.batch([
      db.prepare(
        `INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,? || COALESCE((SELECT name || ' · ' || role || ' · ' || status || ' · actividad ' || activity_scope || ' · sede ' || branch_scope FROM staff WHERE user_id=? AND owner=?),'Sin acceso previo') || ?,? WHERE ${authorization} AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=? AND owner<>?)`,
      ).bind(
        crypto.randomUUID(), p.owner, "Acceso del equipo actualizado",
        `Cuenta ${input.userId} · antes: `, input.userId, p.owner,
        ` · después: ${input.name} · ${input.role} · ${input.status} · actividad ${input.activity_scope} · sede ${input.branch_scope} · motivo: ${input.reason} · operador ${p.userId}`,
        now, ...authorizationArgs, input.userId, p.owner,
      ),
      db.prepare(
        `INSERT INTO staff(user_id,owner,name,role,status,activity_scope,branch_scope,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authorization} ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,activity_scope=excluded.activity_scope,branch_scope=excluded.branch_scope WHERE staff.owner=excluded.owner`,
      ).bind(input.userId, p.owner, input.name, input.role, input.status, input.activity_scope, input.branch_scope, now, ...authorizationArgs),
    ]);
    if (Number(result[1].meta.changes) !== 1)
      throw new ClubError("Tu acceso cambió o esa cuenta pertenece a otro espacio. Volvé a cargar el equipo antes de continuar.", 403);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
