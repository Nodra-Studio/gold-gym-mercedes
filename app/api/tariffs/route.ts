import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { createManagedPlan, livePlanActor } from "@/lib/plan-management";
export const dynamic = "force-dynamic";
const amount = z.number().int().min(0).max(10000000);
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("createPlan"),
    requestKey: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    price: amount,
    days: z.number().int().min(1).max(366),
    accessScope: z.enum(["gym", "pilates", "all"]),
    published: z.boolean().default(false),
  }).strict(),
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
      name: z.string().trim().min(2).max(80).optional(),
      days: z.number().int().min(1).max(366).optional(),
      expectedName: z.string().min(2).max(80).optional(),
      expectedDays: z.number().int().min(1).max(366).optional(),
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
    if (i.kind === "createPlan")
      return Response.json(await createManagedPlan(db, p, i), { headers: { "Cache-Control": "no-store" } });
    let result;
    if (i.kind === "plan") {
      if ((i.name === undefined) !== (i.expectedName === undefined) ||
          (i.days === undefined) !== (i.expectedDays === undefined))
        throw new ClubError("Actualizá el plan antes de cambiar su nombre o duración.", 409);
      const metadataChanged = i.accessScope !== i.expectedScope ||
        (i.name !== undefined && i.name !== i.expectedName) ||
        (i.days !== undefined && i.days !== i.expectedDays);
      if (p.role !== "owner" && metadataChanged)
        throw new ClubError(
          "Solo los dueños pueden cambiar el nombre, la duración o las actividades de un plan existente.",
          403,
        );
      const actor = livePlanActor(p, metadataChanged);
      result = await db.batch([
        db
          .prepare(
            `INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Tarifa de plan actualizada',?,? WHERE ${actor.sql} AND EXISTS(SELECT 1 FROM plans WHERE owner=? AND id=? AND price=? AND published=? AND access_scope=? AND name=coalesce(?,name) AND days=coalesce(?,days))`,
          )
          .bind(
            audit,
            p.owner,
            `${i.id} · ${i.expectedPrice} → ${i.price} ARS · publicación ${i.published} · acceso ${i.expectedScope} → ${i.accessScope} · nombre ${i.expectedName ?? "sin cambio"} → ${i.name ?? "sin cambio"} · días ${i.expectedDays ?? "sin cambio"} → ${i.days ?? "sin cambio"} · precio y duración para próximos cobros; pagos y vencimientos registrados sin cambios; actividades modifican el acceso de socios con este plan · operador ${p.userId}`,
            now,
            ...actor.args,
            p.owner,
            i.id,
            i.expectedPrice,
            i.expectedPublished,
            i.expectedScope,
            i.expectedName ?? null,
            i.expectedDays ?? null,
          ),
        db
          .prepare(
            "UPDATE plans SET price=?,published=?,access_scope=?,name=coalesce(?,name),days=coalesce(?,days) WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM audit WHERE id=? AND owner=?)",
          )
          .bind(
            i.price,
            i.published ? 1 : 0,
            i.accessScope,
            i.name ?? null,
            i.days ?? null,
            i.id,
            p.owner,
            audit,
            p.owner,
          ),
        db.prepare(`SELECT 1 AS allowed WHERE ${actor.sql}`).bind(...actor.args),
      ]);
    } else {
      const actor = livePlanActor(p), ownerActor = livePlanActor(p, true);
      const mayEditPaymentDetails = `(${ownerActor.sql} OR (coalesce((SELECT payment_alias FROM settings WHERE owner=?),'')=? AND coalesce((SELECT whatsapp FROM settings WHERE owner=?),'')=?))`;
      const paymentDetailArgs = [...ownerActor.args, p.owner, i.alias, p.owner, i.whatsapp];
      result = await db.batch([
        db
          .prepare(
            `INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Tarifa de pádel actualizada',?,? WHERE ${actor.sql} AND coalesce((SELECT revision FROM settings WHERE owner=?),0)=? AND ${mayEditPaymentDetails}`,
          )
          .bind(
            audit,
            p.owner,
            `${i.price} ARS · seña ${i.depositPercent}% · operador ${p.userId}`,
            now,
            ...actor.args,
            p.owner,
            i.expectedRevision,
            ...paymentDetailArgs,
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
        db.prepare(`SELECT 1 AS allowed WHERE ${actor.sql} AND ${mayEditPaymentDetails}`).bind(...actor.args, ...paymentDetailArgs),
      ]);
    }
    if (!result[2].results.length)
      throw new ClubError("Tu acceso cambió. Volvé a cargar la pantalla antes de continuar.", 403);
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
