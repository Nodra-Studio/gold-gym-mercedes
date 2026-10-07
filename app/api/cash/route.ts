import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { branchIds, expenseCategories } from "@/lib/branches";
import { isValidDay, localDay } from "@/lib/club";
export const dynamic = "force-dynamic";
const venue = z.enum(branchIds),
  amount = z.number().int().min(1).max(10000000),
  requestKey = z.string().uuid();
const method = z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
  quantity = z.number().int().min(1).max(10000);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("product"),
      name: z.string().trim().min(1).max(120),
      category: z.string().trim().min(1).max(60),
      price: amount,
      requestKey,
    })
    .strict(),
  z
    .object({
      action: z.literal("receive"),
      venue,
      productId: z.string().uuid(),
      quantity,
      note: z.string().trim().min(3).max(300),
      requestKey,
    })
    .strict(),
  z
    .object({
      action: z.literal("sale"),
      venue,
      productId: z.string().uuid(),
      quantity,
      expectedPrice: amount,
      method,
      requestKey,
    })
    .strict(),
  z
    .object({
      action: z.literal("expense"),
      venue,
      category: z.enum(expenseCategories),
      concept: z.string().trim().min(3).max(300),
      amount,
      method,
      day: z.string().refine(isValidDay),
      requestKey,
    })
    .strict(),
  z
    .object({
      action: z.literal("reverse"),
      id: z.string().uuid(),
      reason: z.string().trim().min(3).max(300),
      requestKey,
    })
    .strict(),
]);
const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    const input = schema.safeParse(await body(req));
    if (!input.success)
      throw new ClubError(
        "Revisá la sede, los importes y los datos del formulario.",
      );
    if (input.data.action === "product" || input.data.action === "reverse")
      permit(p, ["owner"]);
    if (input.data.action === "expense" && input.data.day > localDay())
      throw new ClubError("El gasto no puede tener fecha futura.");
    const result = await database()
      .prepare("SELECT record_cash(?,?,?::jsonb) AS result")
      .bind(p.owner, p.userId, JSON.stringify(input.data))
      .first<{
        result: {
          error?: string;
          status?: number;
          ok?: boolean;
          id?: string;
          replayed?: boolean;
        };
      }>();
    if (!result) throw new ClubError("No se pudo guardar el movimiento.", 503);
    if (result.result.error)
      throw new ClubError(result.result.error, result.result.status);
    return Response.json(result.result, { headers });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner", "reception"]);
    const q = new URL(req.url).searchParams,
      today = localDay(),
      from = q.get("from") || today.slice(0, 7) + "-01",
      to = q.get("to") || today;
    if (
      !isValidDay(from) ||
      !isValidDay(to) ||
      from > to ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 366
    )
      throw new ClubError("Elegí un período de hasta 366 días.");
    const branch = q.get("venue") || "",
      category = q.get("category") || "",
      offset = Number(q.get("offset") || 0);
    if (
      branch &&
      branch !== "unknown" &&
      !branchIds.includes(branch as (typeof branchIds)[number])
    )
      throw new ClubError("Sede inválida.");
    if (
      category &&
      !["Cuotas", "Pádel", "Productos", ...expenseCategories].includes(category)
    )
      throw new ClubError("Categoría inválida.");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      throw new ClubError("Página inválida.");
    const union = `WITH ledger AS (
   SELECT c.id,c.venue,c.kind,c.category,c.concept,c.amount,c.method,c.day,c.created_at,c.actor,c.reverses,
    EXISTS(SELECT 1 FROM cash_entries r WHERE r.owner=c.owner AND r.reverses=c.id) AS reversed
    FROM cash_entries c WHERE c.owner=?
   UNION ALL SELECT p.id,p.venue,'membership','Cuotas','Cuota · '||m.name,p.amount,p.method,
    to_char(p.created_at::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),p.created_at,NULL,NULL,false
    FROM payments p JOIN members m ON m.id=p.member_id AND m.owner=p.owner WHERE p.owner=?
   UNION ALL SELECT b.id,b.venue,'padel','Pádel','Pádel · '||r.name,b.amount,b.method,
    to_char(b.created_at::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),b.created_at,NULL,NULL,false
    FROM booking_payments b JOIN bookings r ON r.id=b.booking_id AND r.owner=b.owner WHERE b.owner=?
  ), filtered AS (SELECT * FROM ledger WHERE day>=? AND day<=? ${branch === "unknown" ? "AND venue IS NULL" : branch ? "AND venue=?" : ""} ${category ? "AND category=?" : ""})`;
    const args = [
      p.owner,
      p.owner,
      p.owner,
      from,
      to,
      ...(branch && branch !== "unknown" ? [branch] : []),
      ...(category ? [category] : []),
    ];
    const db = database();
    const data = await db.batch([
      db
        .prepare(
          union +
            " SELECT * FROM filtered ORDER BY day DESC,created_at DESC,id DESC LIMIT 100 OFFSET ?",
        )
        .bind(...args, offset),
      db
        .prepare(
          union +
            ` SELECT count(*)::integer AS count,coalesce(sum(amount) FILTER(WHERE amount>0),0)::float8 AS incoming,coalesce(-sum(amount) FILTER(WHERE amount<0),0)::float8 AS outgoing,coalesce(sum(amount),0)::float8 AS balance FROM filtered`,
        )
        .bind(...args),
      db
        .prepare(
          "SELECT id,name,category,price FROM products WHERE owner=? ORDER BY name",
        )
        .bind(p.owner),
      db
        .prepare(
          "SELECT product_id,venue,sum(quantity)::integer AS quantity FROM stock_moves WHERE owner=? GROUP BY product_id,venue",
        )
        .bind(p.owner),
      db
        .prepare(
          "SELECT s.id,s.venue,s.kind,s.quantity,s.note,s.created_at,s.actor,p.name FROM stock_moves s JOIN products p ON p.id=s.product_id AND p.owner=s.owner WHERE s.owner=? ORDER BY s.created_at DESC,s.id DESC LIMIT 50",
        )
        .bind(p.owner),
    ]);
    return Response.json(
      {
        role: p.role,
        from,
        to,
        entries: data[0].results,
        summary: data[1].results[0],
        products: data[2].results,
        stock: data[3].results,
        stockMoves: data[4].results,
      },
      { headers },
    );
  } catch (e) {
    return apiError(e);
  }
}
