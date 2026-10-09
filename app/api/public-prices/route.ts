import { database, apiError } from "@/lib/server";
import { publicOwner } from "@/lib/public-padel";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const owner = publicOwner(),
      db = database();
    const r = await db.batch([
      db
        .prepare(
          "SELECT id,name,price,days,access_scope FROM plans WHERE owner=? AND published=1 ORDER BY price,name",
        )
        .bind(owner),
      db
        .prepare(
          "SELECT padel_price,deposit_percent FROM settings WHERE owner=? AND price_published=1",
        )
        .bind(owner),
    ]);
    return Response.json(
      { plans: r[0].results, padel: r[1].results[0] ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
