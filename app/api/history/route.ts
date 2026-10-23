import { principal, permit, database, apiError, ClubError } from "@/lib/server";
import { isValidDay, localDay, addDays } from "@/lib/club";
export const dynamic = "force-dynamic";
const tables = [
  "staff",
  "members",
  "plans",
  "member_memberships",
  "payments",
  "bookings",
  "booking_payments",
  "sessions",
  "enrollments",
  "products",
  "cash_entries",
  "stock_moves",
  "settings",
  "issuer_settings",
];
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const q = new URL(req.url).searchParams,
      today = localDay(),
      from = q.get("from") || today.slice(0, 8) + "01",
      to = q.get("to") || today,
      table = q.get("table") || "",
      offset = Number(q.get("offset") || 0);
    if (
      !isValidDay(from) ||
      !isValidDay(to) ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 366 * 86400000 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1000000 ||
      (table && !tables.includes(table))
    )
      throw new ClubError("Revisá las fechas y los filtros del historial.");
    const start = new Date(from + "T00:00:00-03:00").toISOString(),
      end = new Date(addDays(to, 1) + "T00:00:00-03:00").toISOString();
    const result = await database()
      .prepare(
        `SELECT h.id,h.table_name,h.entity_id,h.operation,h.before_state,h.after_state,h.actor,h.reason,h.created_at,s.name AS actor_name FROM operational_changes h LEFT JOIN staff s ON s.user_id=h.actor AND s.owner=h.owner WHERE h.owner=? AND h.created_at>=? AND h.created_at<? ${table ? "AND h.table_name=?" : ""} ORDER BY h.created_at DESC,h.id DESC LIMIT 51 OFFSET ?`,
      )
      .bind(p.owner, start, end, ...(table ? [table] : []), offset)
      .all();
    return Response.json(
      {
        entries: result.results.slice(0, 50),
        hasMore: result.results.length > 50,
        from,
        to,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
