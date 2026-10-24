import { z } from "zod";
import {
  principal,
  permit,
  database,
  body,
  ClubError,
  apiError,
} from "@/lib/server";
import { isValidDay } from "@/lib/club";
import { authenticatedDatabase } from "@/lib/scoped-database";
export const dynamic = "force-dynamic";
const rowSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    dni: z.string().regex(/^\d{7,8}$/),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+\d\s()-]*$/),
    plan: z.string().trim().min(2).max(80),
    status: z.enum(["active", "paused"]),
    expires: z.string().refine(isValidDay),
    homeBranch: z.enum(['calle30', 'calle23', 'velez', 'pilates']).nullable().default(null),
  })
  .strict();
const schema = z
  .object({
    action: z.enum(["preview", "commit"]),
    requestKey: z.string().uuid(),
    rows: z.array(z.unknown()).min(1).max(200),
  })
  .strict();
export async function POST(req: Request) {
  try {
    const p = await principal();
    permit(p, ["owner"]);
    const parsed = schema.safeParse(await body(req, 180000));
    if (!parsed.success)
      throw new ClubError("Archivo inválido. El máximo es de 200 socios.");
    const input = parsed.data,
      db = authenticatedDatabase(database(),p);
    if (input.action === "commit") {
      const previous = await db
        .prepare("SELECT count FROM imports WHERE owner=? AND request_key=?")
        .bind(p.owner, input.requestKey)
        .first<{ count: number }>();
      if (previous)
        return Response.json({
          ok: true,
          replayed: true,
          count: previous.count,
        });
    }
    const results = await db.batch([
      db.prepare("SELECT id,name FROM plans WHERE owner=?").bind(p.owner),
      db.prepare("SELECT dni FROM members WHERE owner=?").bind(p.owner),
    ]);
    const plans = results[0].results as { id: string; name: string }[],
      existing = new Set(
        (results[1].results as { dni: string }[]).map((m) => m.dni),
      ),
      seen = new Set<string>(),
      errors: { row: number; message: string }[] = [],
      valid: (z.infer<typeof rowSchema> & { planId: string })[] = [];
    input.rows.forEach((row, i) => {
      const result = rowSchema.safeParse(row);
      if (!result.success) {
        errors.push({
          row: i + 2,
          message:
            "Revisá nombre, DNI de 7–8 dígitos, teléfono, estado y vencimiento AAAA-MM-DD.",
        });
        return;
      }
      const r = result.data;
      const matches = plans.filter(
        (plan) =>
          plan.name.toLocaleLowerCase("es-AR") ===
          r.plan.toLocaleLowerCase("es-AR"),
      );
      if (matches.length !== 1)
        errors.push({
          row: i + 2,
          message: matches.length
            ? "El nombre del plan es ambiguo. Renombrá los planes antes de importar."
            : `No existe el plan «${r.plan}». Crealo primero.`,
        });
      if (existing.has(r.dni) || seen.has(r.dni))
        errors.push({
          row: i + 2,
          message: "DNI repetido en el archivo o ya registrado en el club.",
        });
      seen.add(r.dni);
      if (matches.length === 1) valid.push({ ...r, planId: matches[0].id });
    });
    if (input.action === "preview")
      return Response.json(
        { valid: errors.length === 0, count: input.rows.length, errors },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (errors.length)
      return Response.json(
        {
          error: "La importación tiene errores. No se guardó ningún socio.",
          errors,
        },
        { status: 409 },
      );
    const now = new Date().toISOString(),
      statements = [
        db
          .prepare(
            "INSERT INTO imports(id,owner,request_key,count,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            p.owner,
            input.requestKey,
            valid.length,
            now,
          ),
      ];
    for (let offset = 0; offset < valid.length; offset += 10) {
      const chunk = valid.slice(offset, offset + 10);
      statements.push(
        db
          .prepare(
            `INSERT INTO members(id,owner,name,dni,phone,plan_id,status,expires,created_at,home_branch) VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",")}`,
          )
          .bind(
            ...chunk.flatMap((r) => [
              crypto.randomUUID(),
              p.owner,
              r.name,
              r.dni,
              r.phone,
              r.planId,
              r.status,
              r.expires,
              now,
              r.homeBranch,
            ]),
          ),
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO audit(id,owner,action,detail,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          p.owner,
          "Socios importados",
          `${valid.length} altas desde CSV · operador ${p.userId}`,
          now,
        ),
    );
    try {
      await db.batch(statements);
    } catch (e) {
      if (String(e).includes("UNIQUE"))
        throw new ClubError(
          "Los datos cambiaron o la importación ya se procesó. Actualizá y revisá antes de reintentar.",
          409,
        );
      throw e;
    }
    return Response.json(
      { ok: true, count: valid.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
