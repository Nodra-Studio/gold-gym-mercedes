import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { slotPassed } from "@/lib/club";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    const db = database(),
      receipt = new URL(req.url).searchParams.get("receipt");
    if (receipt) {
      const row = await db
        .prepare(
          "SELECT receipt,receipt_type FROM booking_requests WHERE id=? AND owner=?",
        )
        .bind(receipt, p.owner)
        .first<{ receipt: string; receipt_type: string }>();
      if (!row?.receipt) throw new ClubError("Comprobante no disponible.", 404);
      return new Response(Buffer.from(row.receipt, "base64"), {
        headers: {
          "Content-Type": row.receipt_type,
          "Content-Disposition":
            'attachment; filename="comprobante.' +
            (row.receipt_type === "application/pdf"
              ? "pdf"
              : row.receipt_type === "image/png"
                ? "png"
                : "jpg") +
            '"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    const result = await db
      .prepare(
        "SELECT id,court,day,start,name,phone,status,amount,deposit_expected,payment_method,created_at,CASE WHEN receipt='' THEN 0 ELSE 1 END AS has_receipt FROM booking_requests WHERE owner=? AND status='pending' ORDER BY created_at LIMIT 200",
      )
      .bind(p.owner)
      .all();
    return Response.json(
      { requests: result.results },
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
    const parsed = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["confirm", "reject"]),
        method:z.enum(["Transferencia","Efectivo"]).default("Transferencia"),
        deposit: z.number().int().min(0).max(10000000).default(0),
        amount: z.number().int().min(1).max(10000000).optional(),
      })
      .strict()
      .safeParse(await body(req));
    if (!parsed.success)
      throw new ClubError("Revisá la solicitud y el importe recibido.");
    const i = parsed.data,
      db = database(),
      r = await db
        .prepare("SELECT * FROM booking_requests WHERE id=? AND owner=?")
        .bind(i.id, p.owner)
        .first<{
          status: string;
          court: number;
          day: string;
          start: number;
          amount: number;
        }>();
    if (!r) throw new ClubError("Solicitud no disponible.", 404);
    if (r.status !== "pending")
      throw new ClubError(
        "Otra persona ya procesó esta solicitud. Actualizá la lista.",
        409,
      );
    const now = new Date().toISOString(),
      booking = crypto.randomUUID();
    if (i.action === "confirm") {
      if (slotPassed(r.day, r.start))
        throw new ClubError(
          "Ese horario ya pasó. Rechazá la solicitud y coordiná otro turno.",
        );
      const amount = i.amount ?? r.amount;
      if (amount < 1)
        throw new ClubError("Ingresá el precio acordado con el cliente.");
      if (i.deposit > amount)
        throw new ClubError("La seña no puede superar el precio del turno.");
      const result = await db.batch([
        db
          .prepare(
            "INSERT INTO bookings(id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key) SELECT ?,owner,court,day,start,name,phone,'booking','confirmed',?,?,?,? FROM booking_requests WHERE id=? AND owner=? AND status='pending'",
          )
          .bind(
            booking,
            amount,
            i.deposit,
            now,
            "public:" + i.id,
            i.id,
            p.owner,
          ),
        db
          .prepare(
            "INSERT INTO booking_payments(id,owner,booking_id,kind,amount,method,created_at,venue) SELECT ?,owner,id,'deposit',deposit,?,?,'velez' FROM bookings WHERE id=? AND owner=? AND deposit>0",
          )
          .bind(crypto.randomUUID(), i.method, now, booking, p.owner),
        db
          .prepare(
            "UPDATE booking_requests SET status='confirmed',booking_id=?,amount=? WHERE id=? AND owner=? AND status='pending' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND owner=?)",
          )
          .bind(booking, amount, i.id, p.owner, booking, p.owner),
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Solicitud de pádel confirmada',?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND owner=?)",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            `${i.id} · ${i.method} verificado ${i.deposit} ARS · operador ${p.userId}`,
            now,
            booking,
            p.owner,
          ),
      ]);
      if (!result[0].meta.changes)
        throw new ClubError("La solicitud cambió. Actualizá la lista.", 409);
    } else {
      await db.batch([
        db
          .prepare(
            "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,'Solicitud de pádel rechazada',?,? WHERE EXISTS(SELECT 1 FROM booking_requests WHERE id=? AND owner=? AND status='pending')",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            `${i.id} · operador ${p.userId}`,
            now,
            i.id,
            p.owner,
          ),
        db
          .prepare(
            "UPDATE booking_requests SET status='rejected' WHERE id=? AND owner=? AND status='pending'",
          )
          .bind(i.id, p.owner),
      ]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      return apiError(
        new ClubError(
          "El horario acaba de ocuparse. Coordiná otra opción con el cliente.",
          409,
        ),
      );
    return apiError(e);
  }
}
