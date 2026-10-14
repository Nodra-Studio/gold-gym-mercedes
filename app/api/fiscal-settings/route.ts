import { principal, permit, database, body, ClubError, apiError } from "@/lib/server";
import { fiscalSettingsSchema, fiscalSelectFields, type FiscalIssuer } from "@/lib/fiscal-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await principal();
    permit(user, ["owner"]);
    const rows = await database()
      .prepare(`SELECT ${fiscalSelectFields} FROM issuer_settings WHERE owner=? ORDER BY venue`)
      .bind(user.owner)
      .all<FiscalIssuer>();
    return Response.json({ settings: rows.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    // Membership is read again on each save, including delegated owners.
    const user = await principal();
    permit(user, ["owner"]);
    const parsed = fiscalSettingsSchema.safeParse(await body(req));
    if (!parsed.success) throw new ClubError(parsed.error.issues[0]?.message ?? "Revisá los datos fiscales.");
    const input = parsed.data;
    const db = database();
    const auditId = crypto.randomUUID();
    const stamp = new Date().toISOString();
    const result = await db.batch([
      db.prepare("INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Datos fiscales actualizados',?,? WHERE coalesce((SELECT revision FROM issuer_settings WHERE owner=? AND venue=?),0)=? AND (?=? OR EXISTS(SELECT 1 FROM staff WHERE user_id=? AND owner=? AND status='active' AND role='owner'))")
        .bind(auditId, user.owner, `Sede ${input.venue} · operador ${user.userId}`, stamp, user.owner, input.venue, input.expectedRevision, user.userId, user.owner, user.userId, user.owner),
      db.prepare("INSERT INTO issuer_settings(id,owner,venue,legal_name,tax_id,fiscal_address,tax_condition,point_of_sale,updated_at,actor,revision) SELECT ?,?,?,?,?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND owner=?) ON CONFLICT(owner,venue) DO UPDATE SET legal_name=excluded.legal_name,tax_id=excluded.tax_id,fiscal_address=excluded.fiscal_address,tax_condition=excluded.tax_condition,point_of_sale=excluded.point_of_sale,updated_at=excluded.updated_at,actor=excluded.actor,revision=issuer_settings.revision+1 WHERE issuer_settings.revision=?")
        .bind(crypto.randomUUID(), user.owner, input.venue, input.legal_name, input.tax_id, input.fiscal_address, input.tax_condition, input.point_of_sale, stamp, user.userId, auditId, user.owner, input.expectedRevision),
      db.prepare(`SELECT ${fiscalSelectFields} FROM issuer_settings WHERE owner=? AND venue=?`)
        .bind(user.owner, input.venue),
    ]);
    if (!result[0].meta.changes || !result[1].meta.changes) {
      permit(await principal(), ["owner"]);
      throw new ClubError("Otra persona cambió estos datos fiscales. Cargá la versión guardada antes de editar nuevamente.", 409);
    }
    return Response.json({ setting: result[2].results[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
