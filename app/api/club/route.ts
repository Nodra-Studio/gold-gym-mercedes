import { slotPassed } from "@/lib/club";
import { z } from "zod";
import { principal, permit, database, body, ClubError } from "@/lib/server";
import {
  localDay,
  addDays,
  slots,
  isValidDay,
  accessDecision,
} from "@/lib/club";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(150),
  name = z.string().trim().min(2).max(80),
  day = z.string().refine(isValidDay, "Fecha inválida"),
  phone = z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s()-]*$/, "Teléfono inválido"),
  key = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seed") }),
  z.object({
    action: z.literal("plan"),
    name,
    price: z.number().int().min(0).max(10000000),
    days: z.number().int().min(1).max(366),
  }),
  z.object({
    action: z.literal("planPrice"),
    id,
    price: z.number().int().min(0).max(10000000),
    expectedPrice: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("settleBooking"),
    id,
    expectedDeposit: z.number().int().min(0),
    method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
  }),
  z.object({
    action: z.literal("member"),
    id: id.optional(),
    name,
    dni: z.string().regex(/^\d{7,8}$/, "El DNI debe tener 7 u 8 números"),
    phone,
    planId: id,
    expires: day,
    status: z.enum(["active", "paused"]),
  }),
  z.object({
    action: z.literal("payment"),
    memberId: id,
    method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
    expectedPrice: z.number().int().min(0),
    requestKey: key,
  }),
  z.object({
    action: z.literal("access"),
    dni: z.string().regex(/^\d{7,8}$/, "Ingresá 7 u 8 números"),
    venue: z.enum(["Calle 30", "Calle 23", "Unión Gold Club"]).optional(),
  }),
  z.object({
    action: z.literal("booking"),
    court: z.number().int().min(1).max(4),
    day,
    start: z.number().refine((v) => slots.includes(v), "Horario inválido"),
    name,
    phone,
    kind: z.enum(["booking", "block"]),
    amount: z.number().int().min(0).max(10000000),
    deposit: z.number().int().min(0).max(10000000),
    depositMethod: z.enum(["Efectivo", "Transferencia", "Tarjeta"]).optional(),
    weeks: z.number().int().min(1).max(12),
    requestKey: key,
  }),
  z.object({ action: z.literal("cancelBooking"), id }),
  z.object({
    action: z.literal("session"),
    name,
    day,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().min(1).max(100),
    venue: z.enum(["Calle 30", "Calle 23", "Unión Gold Club"]),
  }),
  z.object({ action: z.literal("enroll"), sessionId: id, memberId: id }),
  z.object({ action: z.literal("cancelEnrollment"), id }),
]);
function reply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function failure(e: unknown) {
  if (e instanceof ClubError) return reply({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return reply({ error: e.issues[0]?.message ?? "Revisá los datos." }, 400);
  if (String(e).includes("UNIQUE constraint"))
    return reply(
      {
        error:
          "Ya existe ese DNI, reserva o inscripción. Actualizá la pantalla para ver los cambios.",
      },
      409,
    );
  console.error(
    "Club storage error",
    e instanceof Error ? e.message : "unknown",
  );
  return reply(
    {
      error:
        "No pudimos guardar los cambios. Tus datos siguen en el formulario. Volvé a intentar.",
    },
    503,
  );
}
export async function GET() {
  try {
    const context = await principal();
    permit(context, ["owner", "reception"]);
    const owner = context.owner,
      db = database();
    const queries = [
      "SELECT id,name,price,days FROM plans WHERE owner=? ORDER BY name",
      "SELECT m.*,p.name as plan_name,p.price FROM members m JOIN plans p ON p.id=m.plan_id AND p.owner=m.owner WHERE m.owner=? ORDER BY m.name",
      "SELECT p.*,m.name FROM payments p JOIN members m ON m.id=p.member_id AND m.owner=p.owner WHERE p.owner=? ORDER BY p.created_at DESC LIMIT 500",
      "SELECT * FROM accesses WHERE owner=? ORDER BY created_at DESC LIMIT 100",
      "SELECT * FROM bookings WHERE owner=? ORDER BY day,start",
      "SELECT s.*,(SELECT count(*) FROM enrollments e WHERE e.session_id=s.id) as enrolled FROM sessions s WHERE s.owner=? ORDER BY s.day,s.time",
      "SELECT e.*,m.name FROM enrollments e JOIN members m ON m.id=e.member_id AND m.owner=e.owner WHERE e.owner=?",
      "SELECT * FROM audit WHERE owner=? ORDER BY created_at DESC LIMIT 100",
    ];
    const r = await db.batch(queries.map((q) => db.prepare(q).bind(owner)));
    return reply(
      Object.fromEntries([
        ...[
          "plans",
          "members",
          "payments",
          "accesses",
          "bookings",
          "sessions",
          "enrollments",
          "audit",
        ].map((k, i) => [k, r[i].results]),
        ["today", localDay()],
        ["role", context.role],
      ]),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const context = await principal(),
      owner = context.owner,
      input = schema.parse(await body(req)),
      db = database(),
      now = new Date().toISOString(),
      today = localDay();
    const allowed =
      input.action === "access"
        ? (["owner", "reception", "gate"] as const)
        : ["plan", "planPrice", "seed"].includes(input.action)
          ? (["owner"] as const)
          : (["owner", "reception"] as const);
    permit(context, [...allowed]);
    const log = (action: string, detail: string) =>
      db
        .prepare(
          "INSERT INTO audit (id,owner,action,detail,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          owner,
          action,
          `${detail} · operador ${context.userId}`,
          now,
        );
    const owned = async (
      table: "members" | "plans" | "sessions" | "bookings",
      record: string,
    ) => {
      const r = await db
        .prepare(`SELECT * FROM ${table} WHERE id=? AND owner=?`)
        .bind(record, owner)
        .first<Record<string, string | number>>();
      if (!r) throw new ClubError("El registro ya no está disponible.", 404);
      return r;
    };
    switch (input.action) {
      case "seed": {
        const existing = await db
          .prepare("SELECT id FROM plans WHERE owner=? LIMIT 1")
          .bind(owner)
          .first();
        if (existing)
          throw new ClubError(
            "Ya hay datos en este espacio. La carga de ejemplo sólo se permite al comenzar.",
            409,
          );
        const prefix = owner + "-sample-",
          plans = [
            ["free", "Musculación libre", 30000, 30],
            ["personal", "Musculación personalizada", 42000, 30],
            ["pilates", "Pilates", 38000, 30],
          ] as const;
        const stmts = plans.map(([i, n, p, d]) =>
          db
            .prepare(
              "INSERT INTO plans (id,owner,name,price,days) VALUES (?,?,?,?,?)",
            )
            .bind(prefix + i, owner, n, p, d),
        );
        const people = [
          ["Ana Demo", "99000001", "free", 20, "active"],
          ["Bruno Demo", "99000002", "personal", -4, "active"],
          ["Carla Demo", "99000003", "pilates", 8, "paused"],
          ["Diego Demo", "99000004", "free", 2, "active"],
          ["Elena Demo", "99000005", "personal", 25, "active"],
          ["Fede Demo", "99000006", "free", 11, "active"],
        ] as const;
        people.forEach(([n, d, p, offset, status], i) =>
          stmts.push(
            db
              .prepare(
                "INSERT INTO members (id,owner,name,dni,phone,plan_id,status,expires,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                prefix + "m" + i,
                owner,
                n,
                d,
                "",
                prefix + p,
                status,
                addDays(today, offset),
                now,
              ),
          ),
        );
        stmts.push(
          db
            .prepare(
              "INSERT INTO sessions (id,owner,name,day,time,capacity,venue) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              prefix + "session",
              owner,
              "Pilates · ejemplo",
              today,
              "18:00",
              8,
              "Calle 30",
            ),
        );
        stmts.push(
          db
            .prepare(
              "INSERT INTO bookings (id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              prefix + "booking",
              owner,
              2,
              addDays(today, 1),
              1020,
              "Grupo de ejemplo",
              "",
              "booking",
              "confirmed",
              24000,
              12000,
              now,
              prefix + "seed",
            ),
        );
        await db.batch([
          ...stmts,
          log(
            "Ejemplos cargados",
            "Se crearon registros ficticios para la presentación.",
          ),
        ]);
        return reply({ ok: true });
      }
      case "plan": {
        await db.batch([
          db
            .prepare(
              "INSERT INTO plans (id,owner,name,price,days) VALUES (?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              input.name,
              input.price,
              input.days,
            ),
          log("Plan creado", input.name),
        ]);
        break;
      }
      case "planPrice": {
        const p = await owned("plans", input.id);
        // Conditional audit and update share a transaction; stale forms cannot overwrite a newer price.
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO audit (id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM plans WHERE id=? AND owner=? AND price=?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              "Precio actualizado",
              `${p.name} · ${input.expectedPrice} → ${input.price} ARS. Aplica a próximos cobros. · operador ${context.userId}`,
              now,
              input.id,
              owner,
              input.expectedPrice,
            ),
          db
            .prepare(
              "UPDATE plans SET price=? WHERE id=? AND owner=? AND price=?",
            )
            .bind(input.price, input.id, owner, input.expectedPrice),
        ]);
        if (!result[1].meta.changes)
          throw new ClubError(
            "El precio cambió desde que abriste el formulario. Actualizá la página antes de continuar.",
            409,
          );
        break;
      }
      case "settleBooking": {
        const b = await owned("bookings", input.id);
        if (b.status !== "confirmed" || b.kind !== "booking")
          throw new ClubError(
            "Sólo se puede cobrar una reserva confirmada.",
            409,
          );
        if (Number(b.deposit) === Number(b.amount))
          return reply({ ok: true, replayed: true });
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO booking_payments(id,owner,booking_id,kind,amount,method,created_at) SELECT ?,owner,id,'settlement',amount-deposit,?,? FROM bookings WHERE id=? AND owner=? AND status='confirmed' AND kind='booking' AND deposit=? AND amount>deposit",
            )
            .bind(
              crypto.randomUUID(),
              input.method,
              now,
              input.id,
              owner,
              input.expectedDeposit,
            ),
          db
            .prepare(
              "INSERT INTO audit (id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND owner=? AND status='confirmed' AND kind='booking' AND deposit=?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              "Saldo de pádel cobrado",
              `${b.name} · ${b.day} · cancha ${b.court} · ${Number(b.amount) - input.expectedDeposit} ARS · ${input.method} · operador ${context.userId}`,
              now,
              input.id,
              owner,
              input.expectedDeposit,
            ),
          db
            .prepare(
              "UPDATE bookings SET deposit=amount WHERE id=? AND owner=? AND status='confirmed' AND kind='booking' AND deposit=?",
            )
            .bind(input.id, owner, input.expectedDeposit),
        ]);
        if (!result[2].meta.changes)
          throw new ClubError(
            "La reserva cambió. Actualizá la agenda antes de registrar el cobro.",
            409,
          );
        break;
      }
      case "member": {
        await owned("plans", input.planId);
        if (input.id) {
          await owned("members", input.id);
          await db.batch([
            db
              .prepare(
                "UPDATE members SET name=?,dni=?,phone=?,plan_id=?,status=?,expires=? WHERE id=? AND owner=?",
              )
              .bind(
                input.name,
                input.dni,
                input.phone,
                input.planId,
                input.status,
                input.expires,
                input.id,
                owner,
              ),
            log("Socio actualizado", input.name),
          ]);
        } else
          await db.batch([
            db
              .prepare(
                "INSERT INTO members (id,owner,name,dni,phone,plan_id,status,expires,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                owner,
                input.name,
                input.dni,
                input.phone,
                input.planId,
                input.status,
                input.expires,
                now,
              ),
            log("Socio creado", input.name),
          ]);
        break;
      }
      case "payment": {
        const duplicate = await db
          .prepare("SELECT id FROM payments WHERE owner=? AND request_key=?")
          .bind(owner, input.requestKey)
          .first();
        if (duplicate) return reply({ ok: true, replayed: true });
        const m = await owned("members", input.memberId),
          p = await owned("plans", String(m.plan_id));
        if (input.expectedPrice !== p.price)
          throw new ClubError(
            "El precio cambió. Cerrá el formulario y revisá el importe antes de cobrar.",
            409,
          );
        const paymentId = crypto.randomUUID();
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO payments (id,owner,member_id,amount,method,created_at,request_key) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM plans p JOIN members m ON m.plan_id=p.id WHERE m.id=? AND m.owner=? AND p.owner=? AND p.id=? AND p.price=? AND p.days=?)",
            )
            .bind(
              paymentId,
              owner,
              input.memberId,
              p.price,
              input.method,
              now,
              input.requestKey,
              input.memberId,
              owner,
              owner,
              p.id,
              p.price,
              p.days,
            ),
          db
            .prepare(
              "UPDATE members SET expires=date(CASE WHEN expires>? THEN expires ELSE ? END,'+' || ? || ' days') WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM payments WHERE id=?)",
            )
            .bind(today, today, p.days, input.memberId, owner, paymentId),
          db
            .prepare(
              "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payments WHERE id=?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              "Cobro registrado",
              `${m.name} · ${p.name} · ${p.price} ARS · ${input.method} · operador ${context.userId}`,
              now,
              paymentId,
            ),
        ]);
        if (!result[0].meta.changes)
          throw new ClubError(
            "El plan cambió mientras cobrabas. Actualizá y revisá el importe.",
            409,
          );
        break;
      }
      case "access": {
        const m = await db
          .prepare(
            "SELECT id,name,status,expires FROM members WHERE owner=? AND dni=?",
          )
          .bind(owner, input.dni)
          .first<{
            id: string;
            name: string;
            status: string;
            expires: string;
          }>();
        const decision = accessDecision(m, today);
        await db
          .prepare(
            "INSERT INTO accesses (id,owner,member_id,name,allowed,reason,venue,created_at) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            owner,
            m?.id ?? null,
            m?.name ?? "DNI no registrado",
            decision.allowed ? 1 : 0,
            decision.reason,
            "Todas las sedes",
            now,
          )
          .run();
        return reply({
          ...decision,
          name: m?.name ?? null,
          expires: m?.expires ?? null,
          hardware: "simulated",
        });
      }
      case "booking": {
        if (input.day < today || input.day > addDays(today, 365))
          throw new ClubError(
            "Elegí una fecha entre hoy y los próximos 12 meses.",
          );
        if (input.deposit > input.amount)
          throw new ClubError("La seña no puede superar el total.");
        if (input.day === today) {
          const mins =
            Number(
              new Intl.DateTimeFormat("en-GB", {
                timeZone: "America/Argentina/Buenos_Aires",
                hour: "2-digit",
                hour12: false,
              }).format(new Date()),
            ) *
              60 +
            Number(
              new Intl.DateTimeFormat("en-GB", {
                timeZone: "America/Argentina/Buenos_Aires",
                minute: "2-digit",
              }).format(new Date()),
            );
          if (input.start <= mins)
            throw new ClubError("Ese horario ya pasó. Elegí otro turno.");
        }
        const duplicate = await db
          .prepare("SELECT id FROM bookings WHERE owner=? AND request_key=?")
          .bind(owner, input.requestKey + "-0")
          .first();
        if (duplicate) return reply({ ok: true, replayed: true });
        const series = Array.from({ length: input.weeks }, (_, i) => {
          const d = addDays(input.day, i * 7);
          if (d > addDays(today, 365))
            throw new ClubError("La serie supera los 12 meses.");
          return db
            .prepare(
              "INSERT INTO bookings (id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              input.court,
              d,
              input.start,
              input.name,
              input.phone,
              input.kind,
              "confirmed",
              input.kind === "block" ? 0 : input.amount,
              i === 0 && input.kind === "booking" ? input.deposit : 0,
              now,
              input.requestKey + "-" + i,
            );
        });
        await db.batch([
          ...series,
          ...(input.kind === "booking" && input.deposit > 0
            ? [
                db
                  .prepare(
                    "INSERT INTO booking_payments(id,owner,booking_id,kind,amount,method,created_at) SELECT ?,owner,id,'deposit',deposit,?,? FROM bookings WHERE owner=? AND request_key=?",
                  )
                  .bind(
                    crypto.randomUUID(),
                    input.depositMethod ?? "No informado",
                    now,
                    owner,
                    input.requestKey + "-0",
                  ),
              ]
            : []),
          log(
            input.kind === "block" ? "Cancha bloqueada" : "Reserva creada",
            `${input.name} · cancha ${input.court} · ${input.day} · ${input.weeks} turno(s)`,
          ),
        ]);
        break;
      }
      case "cancelBooking": {
        const b = await owned("bookings", input.id);
        if (b.status === "cancelled") return reply({ ok: true });
        await db.batch([
          db
            .prepare(
              "UPDATE bookings SET status='cancelled' WHERE owner=? AND id=?",
            )
            .bind(owner, input.id),
          log("Reserva cancelada", `${b.name} · ${b.day} · cancha ${b.court}`),
        ]);
        break;
      }
      case "session": {
        if (
          slotPassed(
            input.day,
            Number(input.time.slice(0, 2)) * 60 +
              Number(input.time.slice(3, 5)),
          ) ||
          input.day > addDays(today, 365)
        )
          throw new ClubError(
            "Elegí una fecha futura dentro de los próximos 12 meses.",
          );
        await db.batch([
          db
            .prepare(
              "INSERT INTO sessions (id,owner,name,day,time,capacity,venue) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              input.name,
              input.day,
              input.time,
              input.capacity,
              input.venue,
            ),
          log("Clase creada", input.name),
        ]);
        break;
      }
      case "enroll": {
        const m = await owned("members", input.memberId),
          s = await owned("sessions", input.sessionId);
        if (
          slotPassed(
            String(s.day),
            Number(String(s.time).slice(0, 2)) * 60 +
              Number(String(s.time).slice(3, 5)),
          )
        )
          throw new ClubError("La clase ya pasó.");
        const decision = accessDecision(
          { status: String(m.status), expires: String(m.expires) },
          String(s.day),
        );
        if (!decision.allowed)
          throw new ClubError(
            "El socio debe tener una membresía vigente para la fecha de la clase.",
          );
        const enrollmentId = crypto.randomUUID();
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO enrollments (id,owner,session_id,member_id) SELECT ?,?,?,? WHERE (SELECT count(*) FROM enrollments WHERE session_id=?) < (SELECT capacity FROM sessions WHERE id=? AND owner=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND owner=? AND status='active' AND expires>=?)",
            )
            .bind(
              enrollmentId,
              owner,
              input.sessionId,
              input.memberId,
              input.sessionId,
              input.sessionId,
              owner,
              input.memberId,
              owner,
              String(s.day),
            ),
          db
            .prepare(
              "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM enrollments WHERE id=?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              "Inscripción a clase",
              `${m.name} · ${s.name} · operador ${context.userId}`,
              now,
              enrollmentId,
            ),
        ]);
        if (!result[0].meta.changes)
          throw new ClubError(
            "No quedan lugares o cambió la vigencia del socio. Actualizá la información.",
            409,
          );
        break;
      }
      case "cancelEnrollment": {
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO audit(id,owner,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM enrollments WHERE id=? AND owner=?)",
            )
            .bind(
              crypto.randomUUID(),
              owner,
              "Inscripción cancelada",
              `Se liberó un lugar en una clase · operador ${context.userId}`,
              now,
              input.id,
              owner,
            ),
          db
            .prepare("DELETE FROM enrollments WHERE id=? AND owner=?")
            .bind(input.id, owner),
        ]);
        if (!result[1].meta.changes)
          throw new ClubError("La inscripción ya no está disponible.", 404);
        break;
      }
    }
    return reply({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
