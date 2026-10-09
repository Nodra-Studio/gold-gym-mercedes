import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { padelSettings } from "@/lib/padel-settings";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    return Response.json(await padelSettings(p.owner), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const parsed = z
      .object({
        padel_price: z.number().int().min(0).max(10000000).optional(),
        booking_days: z.number().int().min(1).max(90),
        cancel_hours: z.number().int().min(0).max(168),
      })
      .strict()
      .safeParse(await body(req));
    if (!parsed.success)
      throw new ClubError(
        "Revisá precio, anticipación y plazo de cancelación.",
      );
    const s = parsed.data;
    await database().batch([
      database()
        .prepare(
          "INSERT INTO settings(owner,padel_price,booking_days,cancel_hours,price_published) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET booking_days=excluded.booking_days,cancel_hours=excluded.cancel_hours,revision=settings.revision+1,padel_price=coalesce(?,settings.padel_price),price_published=CASE WHEN CAST(? AS integer) IS NULL THEN settings.price_published ELSE 1 END",
        )
        .bind(
          p.owner,
          s.padel_price ?? 0,
          s.booking_days,
          s.cancel_hours,
          s.padel_price === undefined ? 0 : 1,
          s.padel_price ?? null,
          s.padel_price ?? null,
        ),
      database()
        .prepare(
          "INSERT INTO audit(id,owner,action,detail,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          p.owner,
          "Reglas de pádel actualizadas",
          `${s.padel_price === undefined ? "Reglas de reserva" : `${s.padel_price} ARS`} · ${s.booking_days} días · cancelación ${s.cancel_hours} h · operador ${p.userId}`,
          new Date().toISOString(),
        ),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
