import { z } from "zod";
import { isValidDay, slots } from "./club";
const id = z.string().min(1).max(200),
  name = z.string().min(1).max(200),
  stamp = z.string().datetime({ offset: true }),
  day = z.string().refine(isValidDay),
  money = z.number().int().min(0).max(10000000),
  phone = z
    .string()
    .max(30)
    .regex(/^[+\d\s()-]*$/);
const row = {
  plans: z
    .object({ id, name, price: money, days: z.number().int().min(1).max(366) })
    .strict(),
  members: z
    .object({
      id,
      name,
      dni: z.string().regex(/^\d{7,8}$/),
      phone,
      plan_id: id,
      status: z.enum(["active", "paused"]),
      expires: day,
      created_at: stamp,
    })
    .strict(),
  payments: z
    .object({
      id,
      member_id: id,
      amount: money,
      method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
      created_at: stamp,
      request_key: id,
    })
    .strict(),
  accesses: z
    .object({
      id,
      member_id: id.nullable(),
      name,
      allowed: z.number().int().min(0).max(1),
      reason: z.string().max(300),
      venue: name,
      created_at: stamp,
    })
    .strict(),
  bookings: z
    .object({
      created_by: z.string().nullable().optional(),
      id,
      court: z.number().int().min(1).max(4),
      day,
      start: z.number().refine((n) => slots.includes(n)),
      name,
      phone,
      kind: z.enum(["booking", "block"]),
      status: z.enum(["confirmed", "cancelled"]),
      amount: money,
      deposit: money,
      created_at: stamp,
      request_key: id,
    })
    .strict()
    .refine(
      (r) => r.deposit <= r.amount,
      "El total pagado no puede superar el importe",
    ),
  booking_payments: z
    .object({
      id,
      booking_id: id,
      kind: z.enum(["deposit", "settlement"]),
      amount: money.refine((n) => n > 0),
      method: z.enum(["Efectivo", "Transferencia", "Tarjeta", "No informado"]),
      created_at: stamp,
    })
    .strict(),
  sessions: z
    .object({
      id,
      name,
      day,
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      capacity: z.number().int().min(1).max(100),
      venue: name,
    })
    .strict(),
  enrollments: z.object({ id, session_id: id, member_id: id }).strict(),
  audit: z
    .object({
      id,
      action: z.string().max(200),
      detail: z.string().max(3000),
      created_at: stamp,
    })
    .strict(),
};
export const backupTables = [
  "plans",
  "members",
  "payments",
  "accesses",
  "bookings",
  "booking_payments",
  "sessions",
  "enrollments",
  "audit",
] as const;
export const backupSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    configuration: z
      .object({
        padel_price: money,
        booking_days: z.number().int().min(1).max(90),
        cancel_hours: z.number().int().min(0).max(168),
      })
      .strict()
      .optional(),
    exportedAt: stamp,
    fieldNotes: z.record(z.string(), z.string()).optional(),
    records: z
      .object({
        plans: z.array(row.plans),
        members: z.array(row.members),
        payments: z.array(row.payments),
        accesses: z.array(row.accesses),
        bookings: z.array(row.bookings),
        booking_payments: z.array(row.booking_payments).optional(),
        sessions: z.array(row.sessions),
        enrollments: z.array(row.enrollments),
        audit: z.array(row.audit),
      })
      .strict(),
  })
  .strict();
export function validateBackup(value: unknown) {
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success)
    throw Error(
      "El respaldo tiene un formato no admitido o campos inválidos. Usá el JSON exportado por Gold Gym.",
    );
  if (parsed.data.schemaVersion === 2 && !parsed.data.records.booking_payments)
    throw Error("El respaldo versión 2 debe incluir los cobros de pádel.");
  const b = {
      ...parsed.data,
      records: {
        ...parsed.data.records,
        booking_payments: parsed.data.records.booking_payments ?? [],
      },
    },
    ids = new Set<string>();
  for (const table of backupTables)
    for (const record of b.records[table]) {
      if (ids.has(record.id))
        throw Error("El respaldo contiene identificadores repetidos.");
      ids.add(record.id);
    }
  const members = new Set(b.records.members.map((r) => r.id)),
    plans = new Set(b.records.plans.map((r) => r.id)),
    sessions = new Map(b.records.sessions.map((r) => [r.id, r.capacity]));
  if (
    b.records.members.some((m) => !plans.has(m.plan_id)) ||
    b.records.payments.some((p) => !members.has(p.member_id)) ||
    b.records.accesses.some(
      (a) => a.member_id !== null && !members.has(a.member_id),
    ) ||
    b.records.enrollments.some(
      (e) => !members.has(e.member_id) || !sessions.has(e.session_id),
    )
  )
    throw Error(
      "El respaldo tiene relaciones incompletas entre socios, planes y clases.",
    );
  function unique(values: string[]) {
    if (new Set(values).size !== values.length)
      throw Error("El respaldo contiene DNI, turnos o movimientos duplicados.");
  }
  const bookings = new Map(b.records.bookings.map((b) => [b.id, b]));
  const paid = new Map<string, number>();
  for (const payment of b.records.booking_payments) {
    const booking = bookings.get(payment.booking_id);
    if (!booking || booking.kind !== "booking")
      throw Error("Un cobro de pádel no tiene una reserva válida.");
    paid.set(booking.id, (paid.get(booking.id) ?? 0) + payment.amount);
    if (paid.get(booking.id)! > booking.deposit)
      throw Error(
        "Los cobros detallados superan el total pagado de la reserva.",
      );
  }
  unique(b.records.booking_payments.map((p) => `${p.booking_id}:${p.kind}`));
  unique(b.records.members.map((m) => m.dni));
  unique(b.records.payments.map((p) => p.request_key));
  unique(b.records.bookings.map((b) => b.request_key));
  unique(
    b.records.bookings
      .filter((b) => b.status === "confirmed")
      .map((b) => `${b.day}:${b.court}:${b.start}`),
  );
  unique(b.records.enrollments.map((e) => `${e.session_id}:${e.member_id}`));
  for (const [id, capacity] of sessions)
    if (
      b.records.enrollments.filter((e) => e.session_id === id).length > capacity
    )
      throw Error("Una clase del respaldo supera su cupo.");
  return b;
}
