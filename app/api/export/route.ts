import { principal, permit, database, ClubError } from "@/lib/server";
export const dynamic = "force-dynamic";

// One transaction gives the owner a consistent, portable copy of all records.
export async function GET() {
  try {
    const context = await principal();
    permit(context, ["owner"]);
    const owner = context.owner;
    const db = database();
    const tables = [
      "plans",
      "members",
      "payments",
      "accesses",
      "bookings",
      "booking_payments",
      "sessions",
      "enrollments",
      "audit",
      "products",
      "cash_entries",
      "stock_moves",
    ] as const;
    const results = await db.batch<Record<string, unknown>>([
      ...tables.map((table) =>
        db.prepare(`SELECT * FROM ${table} WHERE owner=?`).bind(owner),
      ),
      db
        .prepare(
          "SELECT padel_price,booking_days,cancel_hours FROM settings WHERE owner=?",
        )
        .bind(owner),
    ]);
    const records = Object.fromEntries(
      tables.map((table, i) => [
        table,
        results[i].results.map((row) => {
          const record = { ...row };
          delete record.owner;
          return record;
        }),
      ]),
    );
    return new Response(
      JSON.stringify(
        {
          schemaVersion: 3,
          configuration: results[tables.length].results[0] ?? {
            padel_price: 24000,
            booking_days: 30,
            cancel_hours: 24,
          },
          fieldNotes: {
            "bookings.deposit":
              "Total pagado acumulado. booking_payments detalla cobros registrados desde la incorporación del historial; los pagos anteriores pueden no tener detalle.",
          },
          exportedAt: new Date().toISOString(),
          records,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="gold-gym-datos.json"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ClubError
            ? error.message
            : "No pudimos exportar los datos. Intentá nuevamente.",
      },
      {
        status: error instanceof ClubError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

