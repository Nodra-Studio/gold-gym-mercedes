import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { branchIds } from "@/lib/branches";
export const dynamic = "force-dynamic";
const common = {
  source: z.enum(["membership", "booking"]),
  id: z.string().min(1).max(200),
  expectedRevision: z.number().int().min(1).max(999999999),
  reason: z.string().trim().min(3).max(300),
  requestKey: z.string().uuid(),
};
const schema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("void") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("edit"),
      amount: z.number().int().min(0).max(10000000),
      method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
      venue: z.enum(branchIds),
    })
    .strict(),
]);
const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success)
      throw new ClubError(
        "Revisá el cobro, los datos y el motivo de la corrección.",
      );
    const row = await database()
      .prepare("SELECT record_payment_change(?,?,?::jsonb) AS result")
      .bind(p.owner, p.userId, JSON.stringify(parsed.data))
      .first<{
        result: {
          ok?: boolean;
          error?: string;
          status?: number;
          id?: string;
          replayed?: boolean;
        };
      }>();
    if (!row) throw new ClubError("No se pudo guardar la corrección.", 503);
    if (row.result.error)
      throw new ClubError(row.result.error, row.result.status ?? 400);
    return Response.json(row.result, { headers });
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const q = new URL(req.url).searchParams,
      source = q.get("source"),
      id = q.get("id");
    if (
      !id ||
      id.length > 200 ||
      !["membership", "booking"].includes(source ?? "")
    )
      throw new ClubError("Cobro inválido.");
    const table = source === "booking" ? "booking_payments" : "payments";
    const result = await database().batch([
      database()
        .prepare(
          `SELECT id,amount,method,venue,revision,voided,created_at FROM ${table} WHERE owner=? AND id=?`,
        )
        .bind(p.owner, id),
      database()
        .prepare(
          "SELECT id,before_state,after_state,reason,actor,created_at FROM payment_changes WHERE owner=? AND source=? AND payment_id=? ORDER BY created_at DESC,id DESC",
        )
        .bind(p.owner, source, id),
    ]);
    if (!result[0].results.length)
      throw new ClubError("El cobro no está disponible.", 404);
    return Response.json(
      { payment: result[0].results[0], changes: result[1].results },
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}
