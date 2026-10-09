import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
export const dynamic = "force-dynamic";
const amount = z.number().int().min(0).max(10000000);
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("plan"),
      id: z.string().min(1).max(200),
      price: amount,
      published: z.boolean(),
      accessScope: z.enum(["gym", "pilates", "all"]),
      expectedPrice: amount,
      expectedPublished: z.number().int().min(0).max(1),
      expectedScope: z.enum(["gym", "pilates", "all"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("padel"),
      price: amount,
      depositPercent: z.number().int().min(0).max(100),
      whatsapp: z.string().regex(/^\d{8,15}$|^$/),
      alias: z.string().trim().max(100),
      expectedRevision: z.number().int().min(0),
    })
    .strict(),
]);
export async function GET() {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    const db = database();
    const rows = await db.batch([
      db
        .prepare(
          "SELECT id,name,price,days,access_scope,published FROM plans WHERE owner=? ORDER BY name",
        )
        .bind(p.owner),
      db
        .prepare(
          "SELECT padel_price,deposit_percent,payment_alias,whatsapp,revision FROM settings WHERE owner=?",
        )
        .bind(p.owner),
    ]);
    return Response.json(
      {
        role: p.role,
        plans: rows[0].results,
        padel: rows[1].results[0] ?? {
          padel_price: 0,
          deposit_percent: 0,
          payment_alias: "",
          whatsapp: "",
          revision: 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success)
      throw new ClubError("Revisá los importes y datos de la tarifa.");
    const i = parsed.data,
      db = database(),
      now = new Date().toISOString(),
      audit = crypto.randomUUID();
    let result;
    if (i.kind === "plan") {
      if (p.role !== "owner" && i.accessScope !== i.expectedScope)
        throw new ClubError(
          "Solo el dueño puede cambiar las actividades incluidas.",
          403,
        );
      result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Tarifa de plan actualizada',?,? WHERE EXISTS(SELECT 1 FROM plans WHERE owner=? AND id=? AND price=? AND published=? AND access_scope=?)",
          )
          .bind(
            audit,
            p.owner,
            `${i.id} · ${i.expectedPrice} → ${i.price} ARS · publicación ${i.published} · acceso ${i.accessScope} · operador ${p.userId}`,
            now,
            p.owner,
            i.id,
            i.expectedPrice,
            i.expectedPublished,
            i.expectedScope,
          ),
        db
          .prepare(
            "UPDATE plans SET price=?,published=?,access_scope=? WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND owner=?)",
          )
          .bind(
            i.price,
            i.published ? 1 : 0,
            i.accessScope,
            i.id,
            p.owner,
            audit,
            p.owner,
          ),
      ]);
    } else {
      result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Tarifa de pádel actualizada',?,? WHERE coalesce((SELECT revision FROM settings WHERE owner=?),0)=?",
          )
          .bind(
            audit,
            p.owner,
            `${i.price} ARS · seña ${i.depositPercent}% · operador ${p.userId}`,
            now,
            p.owner,
            i.expectedRevision,
          ),
        db
          .prepare(
            "INSERT INTO settings(owner,padel_price,booking_days,cancel_hours,deposit_percent,payment_alias,whatsapp,revision,price_published) SELECT ?,?,30,24,?,?,?,1,1 WHERE EXISTS(SELECT 1 FROM audit WHERE id=? AND owner=?) ON CONFLICT(owner) DO UPDATE SET padel_price=excluded.padel_price,deposit_percent=excluded.deposit_percent,payment_alias=excluded.payment_alias,whatsapp=excluded.whatsapp,revision=settings.revision+1,price_published=1",
          )
          .bind(
            p.owner,
            i.price,
            i.depositPercent,
            i.alias,
            i.whatsapp,
            audit,
            p.owner,
          ),
      ]);
    }
    if (!result[0].meta.changes)
      throw new ClubError(
        "Otra persona cambió esta tarifa. Actualizá la pantalla antes de guardar.",
        409,
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
