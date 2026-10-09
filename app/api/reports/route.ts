import { principal, permit, database, ClubError, apiError } from "@/lib/server";
import { localDay, addDays, isValidDay } from "@/lib/club";
import { csvDocument } from "@/lib/csv";
export const dynamic = "force-dynamic";
const pageSize = 25;
function page(value: string | null) {
  if (value === null) return 1;
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new ClubError("Página inválida.");
  return Number(value);
}
export async function GET(req: Request) {
  try {
    const context = await principal();
    permit(context, ["owner"]);
    const db = database(),
      owner = context.owner,
      query = new URL(req.url).searchParams;
    const today = localDay(),
      from = query.get("from") ?? today.slice(0, 8) + "01",
      to = query.get("to") ?? today;
    if (
      !isValidDay(from) ||
      !isValidDay(to) ||
      from > to ||
      from < "2000-01-01" ||
      to > "2100-12-31" ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 365
    )
      throw new ClubError(
        "Elegí un período válido de hasta 366 días entre 2000 y 2100.",
      );
    // Club business days are Argentina UTC−03:00; upper boundary is exclusive.
    const begin = new Date(from + "T00:00:00-03:00").toISOString(),
      end = new Date(addDays(to, 1) + "T00:00:00-03:00").toISOString();
    const paymentPage = page(query.get("paymentPage")),
      bookingPage = page(query.get("bookingPage"));
    const format = query.get("format");
    if (format && format !== "csv") throw new ClubError("Formato inválido.");
    const movements =
      "SELECT p.id,p.amount,p.method,p.created_at,m.name,'Gimnasio' AS activity,'Cuota' AS concept FROM payments p JOIN members m ON m.id=p.member_id AND m.owner=p.owner WHERE p.owner=? AND p.created_at>=? AND p.created_at<? UNION ALL SELECT p.id,p.amount,p.method,p.created_at,b.name,'Pádel' AS activity,CASE p.kind WHEN 'deposit' THEN 'Seña' ELSE 'Saldo' END AS concept FROM booking_payments p JOIN bookings b ON b.id=p.booking_id AND b.owner=p.owner WHERE p.owner=? AND p.created_at>=? AND p.created_at<?";
    const paymentQuery = `SELECT * FROM (${movements}) ORDER BY created_at DESC,id DESC`;
    const movementArgs = [owner, begin, end, owner, begin, end];
    if (format === "csv") {
      const rows = await db
        .prepare(paymentQuery + " LIMIT 10001")
        .bind(...movementArgs)
        .all<{
          id: string;
          amount: number;
          method: string;
          created_at: string;
          name: string;
          activity: string;
          concept: string;
        }>();
      if (rows.results.length > 10000)
        throw new ClubError(
          "El período supera 10.000 cobros. Elegí un período más corto para exportar.",
          413,
        );
      return new Response(
        csvDocument([
          [
            "ID",
            "Fecha y hora (Argentina)",
            "Nombre",
            "Actividad",
            "Concepto",
            "Medio",
            "Importe ARS",
          ],
          ...rows.results.map((r) => [
            r.id,
            new Intl.DateTimeFormat("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              dateStyle: "short",
              timeStyle: "medium",
            }).format(new Date(r.created_at)),
            r.name,
            r.activity,
            r.concept,
            r.method,
            r.amount,
          ]),
        ]),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="gold-gym-cobros-${from}-${to}.csv"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    const debtFilter =
      "owner=? AND day>=? AND day<=? AND kind='booking' AND status='confirmed' AND amount>deposit";
    const results = await db.batch([
      db
        .prepare(
          `SELECT activity,method,COUNT(*) AS count,COALESCE(SUM(amount),0) AS total FROM (${movements}) GROUP BY activity,method ORDER BY activity,method`,
        )
        .bind(...movementArgs),
      db
        .prepare(paymentQuery + " LIMIT ? OFFSET ?")
        .bind(...movementArgs, pageSize, (paymentPage - 1) * pageSize),
      db
        .prepare(
          `SELECT COUNT(*) AS count,COALESCE(SUM(amount-deposit),0) AS total FROM bookings WHERE ${debtFilter}`,
        )
        .bind(owner, from, to),
      db
        .prepare(
          `SELECT id,name,day,start,court,amount,deposit FROM bookings WHERE ${debtFilter} ORDER BY day,start,court,id LIMIT ? OFFSET ?`,
        )
        .bind(owner, from, to, pageSize, (bookingPage - 1) * pageSize),
      db
        .prepare(
          "SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END),0) AS paused,COALESCE(SUM(CASE WHEN status='active' AND expires<? AND NOT EXISTS(SELECT 1 FROM member_memberships mm WHERE mm.owner=members.owner AND mm.member_id=members.id AND mm.status='active' AND mm.expires>=?) THEN 1 ELSE 0 END),0) AS expired,COALESCE(SUM(CASE WHEN status='active' AND (expires>=? OR EXISTS(SELECT 1 FROM member_memberships mm WHERE mm.owner=members.owner AND mm.member_id=members.id AND mm.status='active' AND mm.expires>=?)) THEN 1 ELSE 0 END),0) AS current FROM members WHERE owner=?",
        )
        .bind(today, today, today, today, owner),
    ]);
    return Response.json(
      {
        from,
        to,
        today,
        generatedAt: new Date().toISOString(),
        pageSize,
        paymentPage,
        bookingPage,
        methods: results[0].results,
        payments: results[1].results,
        balances: results[2].results[0],
        bookings: results[3].results,
        members: results[4].results[0],
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
