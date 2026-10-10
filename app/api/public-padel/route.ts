import { z } from "zod";
import { createHash } from "node:crypto";
import { database, body, ClubError, apiError } from "@/lib/server";
import { publicOwner, validateReceipt } from "@/lib/public-padel";
const settingsQuery =
  "SELECT CASE WHEN price_published=1 THEN padel_price ELSE 0 END AS padel_price,booking_days,cancel_hours,deposit_percent,payment_alias,whatsapp,revision FROM settings WHERE owner=?";
const defaultSettings = {
  padel_price: 0,
  booking_days: 30,
  cancel_hours: 24,
  deposit_percent: 0,
  payment_alias: "",
  whatsapp: "",
  revision: 0,
};
async function padelSettings(owner: string) {
  return (
    (await database()
      .prepare(settingsQuery)
      .bind(owner)
      .first<typeof defaultSettings>()) ?? defaultSettings
  );
}
import { localDay, addDays, isValidDay, slots, slotPassed } from "@/lib/club";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    day: z.string().refine(isValidDay),
    court: z.number().int().min(1).max(4),
    start: z.number().refine((n) => slots.includes(n)),
    name: z.string().trim().min(2).max(80),
    phone: z.string().regex(/^\+?\d{8,15}$/),
    expectedPrice: z.number().int().min(0),
    expectedRevision: z.number().int().min(0).optional(),
    paymentMethod: z.literal("Transferencia").default("Transferencia"),
    requestKey: z.string().uuid(),
    receipt: z.string().max(1400000).default(""),
    receiptType: z
      .enum(["", "image/jpeg", "image/png", "application/pdf"])
      .default(""),
    website: z.string().max(0).default(""),
  })
  .strict();
export async function GET(req: Request) {
  try {
    const owner = publicOwner(),
      today = localDay(),
      day = new URL(req.url).searchParams.get("day") ?? today,
      db = database();
    if (!isValidDay(day) || day < today)
      throw new ClubError("Elegí una fecha dentro del período disponible.");
    // Settings and occupancy share one snapshot and one database transaction.
    const rows = await db.batch([
      db.prepare(settingsQuery).bind(owner),
      db
        .prepare(
          "SELECT court,start FROM bookings WHERE owner=? AND day=? AND status='confirmed'",
        )
        .bind(owner, day),
    ]);
    const settings =
      (rows[0].results[0] as typeof defaultSettings | undefined) ??
      defaultSettings;
    if (day > addDays(today, settings.booking_days))
      throw new ClubError("Elegí una fecha dentro del período disponible.");
    return Response.json(
      { today, day, settings, occupied: rows[1].results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    const owner = publicOwner(),
      parsed = schema.safeParse(await body(req, 1450000));
    if (!parsed.success)
      throw new ClubError(
        "Revisá nombre, teléfono, horario y comprobante (hasta 1 MB).",
      );
    const i = parsed.data,
      db = database(),
      settings = await padelSettings(owner);
    const duplicate = await db
      .prepare(
        "SELECT id,amount,deposit_expected FROM booking_requests WHERE owner=? AND request_key=?",
      )
      .bind(owner, i.requestKey)
      .first<{ id: string; amount: number; deposit_expected: number }>();
    if (duplicate)
      return Response.json({ ok: true, ...duplicate, replayed: true });
    if (
      slotPassed(i.day, i.start) ||
      i.day > addDays(localDay(), settings.booking_days)
    )
      throw new ClubError("Ese horario ya pasó o no está habilitado.");
    if (
      i.expectedPrice !== settings.padel_price ||
      (i.expectedRevision !== undefined &&
        i.expectedRevision !== settings.revision)
    )
      throw new ClubError(
        "La tarifa cambió. Actualizá los horarios antes de enviar.",
        409,
      );
    validateReceipt(i.receipt, i.receiptType);
    // Persisted counters are shared across serverless instances. No raw IP or phone in the counter key.
    const bucket = Math.floor(Date.now() / 900000),
      ip =
        req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
    const keys = [`phone:${i.phone}`, `ip:${ip}`].map((k) =>
      createHash("sha256").update(`padel:${owner}:${k}`).digest("hex"),
    );
    const limits = await db.batch(
      keys.map((k) =>
        db
          .prepare(
            "INSERT INTO auth_limits(key,bucket,attempts) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET attempts=auth_limits.attempts+1 RETURNING attempts",
          )
          .bind(k, bucket),
      ),
    );
    if (
      limits.some(
        (r) => Number((r.results[0] as { attempts: number }).attempts) > 5,
      )
    )
      throw new ClubError(
        "Ya recibimos varias solicitudes. Esperá unos minutos o contactá a recepción.",
        429,
      );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const rows = await db.batch([
      db
        .prepare(
          "INSERT INTO booking_requests(id,owner,court,day,start,name,phone,amount,receipt,receipt_type,request_key,created_at,deposit_expected,payment_method) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE owner=? AND court=? AND day=? AND start=? AND status='confirmed') AND NOT EXISTS(SELECT 1 FROM booking_requests WHERE owner=? AND phone=? AND day=? AND start=? AND status='pending') AND coalesce((SELECT revision FROM settings WHERE owner=?),0)=? ON CONFLICT(owner,request_key) DO NOTHING",
        )
        .bind(
          id,
          owner,
          i.court,
          i.day,
          i.start,
          i.name,
          i.phone,
          settings.padel_price,
          i.receipt,
          i.receiptType,
          i.requestKey,
          now,
          Math.round((settings.padel_price * settings.deposit_percent) / 100),
          i.paymentMethod,
          owner,
          i.court,
          i.day,
          i.start,
          owner,
          i.phone,
          i.day,
          i.start,
          owner,
          settings.revision,
        ),
    ]);
    if (!rows[0].meta.changes) {
      const replay = await db
        .prepare(
          "SELECT id,amount,deposit_expected FROM booking_requests WHERE owner=? AND request_key=?",
        )
        .bind(owner, i.requestKey)
        .first<{ id: string; amount: number; deposit_expected: number }>();
      if (replay) return Response.json({ ok: true, ...replay, replayed: true });
      throw new ClubError(
        "El turno se ocupó o ya tenés una solicitud pendiente para ese horario. Contactá a recepción.",
        409,
      );
    }
    return Response.json(
      {
        ok: true,
        id,
        amount: settings.padel_price,
        deposit_expected: Math.round(
          (settings.padel_price * settings.deposit_percent) / 100,
        ),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
