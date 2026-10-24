import { principal, permit, database, ClubError, apiError } from "@/lib/server";
import { allowsActivity } from "@/lib/staff-scope";
import { authenticatedDatabase } from "@/lib/scoped-database";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    if (!allowsActivity(p,"padel")) throw new ClubError("Tu acceso no incluye pádel.",403);
    const id = new URL(req.url).searchParams.get("bookingId");
    if (!id || id.length > 200) throw new ClubError("Reserva inválida.");
    const db = authenticatedDatabase(database(),p),
      rows = await db.batch<Record<string, unknown>>([
        db
          .prepare("SELECT deposit FROM bookings WHERE owner=? AND id=?")
          .bind(p.owner, id),
        db
          .prepare(
            "SELECT id,kind,amount,method,created_at,venue,revision,voided FROM booking_payments WHERE owner=? AND booking_id=? ORDER BY created_at,id",
          )
          .bind(p.owner, id),
      ]);
    const booking = rows[0].results[0];
    if (!booking) throw new ClubError("La reserva no está disponible.", 404);
    const detailed = rows[1].results.reduce<number>(
      (sum, r) => sum + (Number(r.voided) ? 0 : Number(r.amount)),
      0,
    );
    return Response.json(
      {
        payments: rows[1].results,
        undocumented: Math.max(0, Number(booking.deposit) - detailed),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
