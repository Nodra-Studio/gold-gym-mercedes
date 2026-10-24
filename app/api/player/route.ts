import { authenticatedDatabase } from "@/lib/scoped-database";
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
import { localDay, addDays, slots, isValidDay, slotPassed } from "@/lib/club";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("book"),
      day: z.string().refine(isValidDay),
      court: z.number().int().min(1).max(4),
      start: z.number().refine((s) => slots.includes(s)),
      expectedPrice: z.number().int().min(0),
      requestKey: z.string().uuid(),
    })
    .strict(),
  z
    .object({ action: z.literal("cancel"), id: z.string().min(1).max(200) })
    .strict(),
]);
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["player", "owner"]);
    const settings = await padelSettings(p.owner),
      today = localDay(),
      day = new URL(req.url).searchParams.get("day") ?? today;
    if (
      !isValidDay(day) ||
      day < today ||
      day > addDays(today, settings.booking_days)
    )
      throw new ClubError("Fecha fuera del período de reservas.");
    const results = await database().batch([
      database()
        .prepare(
          "SELECT court,start FROM bookings WHERE owner=? AND day=? AND status='confirmed'",
        )
        .bind(p.owner, day),
      database()
        .prepare(
          "SELECT id,court,day,start,status,amount,deposit FROM bookings WHERE owner=? AND created_by=? ORDER BY day DESC,start DESC LIMIT 100",
        )
        .bind(p.owner, p.userId),
    ]);
    return Response.json(
      {
        day,
        today,
        settings,
        occupied: results[0].results,
        mine: results[1].results,
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
    permit(p, ["player", "owner"]);
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) throw new ClubError("Revisá la reserva.");
    const input = parsed.data,
      db = authenticatedDatabase(database(),p),
      settings = await padelSettings(p.owner),
      now = new Date().toISOString();
    if (input.action === "book") {
      const key = "player:" + p.userId + ":" + input.requestKey;
      const duplicate = await db
        .prepare(
          "SELECT id FROM bookings WHERE owner=? AND request_key=? AND created_by=?",
        )
        .bind(p.owner, key, p.userId)
        .first();
      if (duplicate) return Response.json({ ok: true, replayed: true });
      if (
        input.day < localDay() ||
        input.day > addDays(localDay(), settings.booking_days) ||
        slotPassed(input.day, input.start)
      )
        throw new ClubError(
          "Ese turno ya pasó o está fuera del período habilitado.",
        );
      if (input.expectedPrice !== settings.padel_price)
        throw new ClubError(
          "El precio cambió. Actualizá la disponibilidad antes de reservar.",
          409,
        );
      const person = await db
        .prepare("SELECT name FROM staff WHERE user_id=? AND owner=?")
        .bind(p.userId, p.owner)
        .first<{ name: string }>();
      await db.batch([
        db
          .prepare(
            "INSERT INTO bookings(id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key,created_by) VALUES(?,?,?,?,?,?,?,'booking','confirmed',?,0,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            input.court,
            input.day,
            input.start,
            person?.name ?? "Reserva de administración",
            "",
            settings.padel_price,
            now,
            key,
            p.userId,
          ),
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            "Reserva desde portal",
            `Cancha ${input.court} · ${input.day} · cuenta ${p.userId}`,
            now,
          ),
      ]);
    } else {
      const b = await db
        .prepare(
          "SELECT day,start,deposit,status FROM bookings WHERE id=? AND owner=? AND created_by=?",
        )
        .bind(input.id, p.owner, p.userId)
        .first<{
          day: string;
          start: number;
          deposit: number;
          status: string;
        }>();
      if (!b) throw new ClubError("Reserva no disponible.", 404);
      if (b.status === "cancelled")
        return Response.json({ ok: true, replayed: true });
      const starts = new Date(
        `${b.day}T${String(Math.floor(b.start / 60)).padStart(2, "0")}:${String(b.start % 60).padStart(2, "0")}:00-03:00`,
      ).getTime();
      if (
        starts - Date.now() < settings.cancel_hours * 3600000 ||
        b.deposit > 0
      )
        throw new ClubError(
          "Para cancelar este turno, contactá al club: está fuera de plazo o tiene un pago registrado.",
          409,
        );
      const result = await db.batch([
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND owner=? AND created_by=? AND deposit=0 AND status='confirmed')",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            "Cancelación desde portal",
            `${input.id} · cuenta ${p.userId}`,
            now,
            input.id,
            p.owner,
            p.userId,
          ),
        db
          .prepare(
            "UPDATE bookings SET status='cancelled' WHERE id=? AND owner=? AND created_by=? AND deposit=0 AND status='confirmed'",
          )
          .bind(input.id, p.owner, p.userId),
      ]);
      if (!result[1].meta.changes)
        throw new ClubError("La reserva cambió. Actualizá tus reservas.", 409);
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      return Response.json(
        { error: "Ese turno acaba de ocuparse. Elegí otro horario." },
        { status: 409 },
      );
    return apiError(e);
  }
}
