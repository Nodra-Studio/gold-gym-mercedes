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
const venue = z.enum(["calle30", "calle23", "velez", "pilates"]);
const cashCommon = {
  id,
  request_key: id,
  payload: z.string().max(4000),
  created_at: stamp,
  actor: id,
};
const productState = z
  .object({
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(60),
    price: money.refine((n) => n > 0),
    active: z.number().int().min(0).max(1),
    revision: z.number().int().min(1),
  })
  .strict();
const stateText = z
  .string()
  .max(1500)
  .refine((raw) => {
    try {
      return productState.safeParse(JSON.parse(raw)).success;
    } catch {
      return false;
    }
  });
const row = {
  product_changes: z
    .object({
      ...cashCommon,
      product_id: id,
      before_state: stateText,
      after_state: stateText,
    })
    .strict(),
  products: z
    .object({
      ...cashCommon,
      name: z.string().min(1).max(120),
      category: z.string().min(1).max(60),
      price: money.refine((n) => n > 0),
      active: z.number().int().min(0).max(1).default(1),
      revision: z.number().int().min(1).default(1),
    })
    .strict(),
  cash_entries: z
    .object({
      ...cashCommon,
      venue,
      kind: z.enum(["sale", "expense", "reversal"]),
      category: name,
      concept: z.string().min(1).max(400),
      amount: z
        .number()
        .int()
        .min(-10000000)
        .max(10000000)
        .refine((n) => n !== 0),
      method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
      day,
      product_id: id.nullable(),
      quantity: z.number().int().min(1).max(10000).nullable(),
      reverses: id.nullable(),
    })
    .strict(),
  stock_moves: z
    .object({
      ...cashCommon,
      venue,
      product_id: id,
      quantity: z
        .number()
        .int()
        .min(-10000)
        .max(10000)
        .refine((n) => n !== 0),
      kind: z.enum([
        "receive",
        "sale",
        "reversal",
        "transfer_out",
        "transfer_in",
        "adjustment",
      ]),
      transfer_id: id.nullable().default(null),
      note: z.string().max(300),
      cash_entry_id: id.nullable(),
    })
    .strict(),
  booking_requests: z
    .object({
      id,
      court: z.number().int().min(1).max(4),
      day,
      start: z.number().refine((n) => slots.includes(n)),
      name,
      phone,
      status: z.enum(["pending", "confirmed", "rejected"]),
      amount: money,
      receipt: z.string().max(1400000),
      deposit_expected:money.default(0),
      payment_method:z.enum(["Transferencia","Efectivo"]).default("Transferencia"),
      receipt_type: z.enum(["", "image/jpeg", "image/png", "application/pdf"]),
      request_key: id,
      created_at: stamp,
      booking_id: id.nullable(),
    })
    .strict(),
  plans: z
    .object({
      id,
      name,
      price: money,
      days: z.number().int().min(1).max(366),
      published:z.number().int().min(0).max(1).default(0),
      access_scope: z.enum(["gym", "pilates", "all"]).optional(),
    })
    .strict()
    .transform((p) => ({
      ...p,
      access_scope:
        p.access_scope ??
        (/pilates/i.test(p.name) ? ("pilates" as const) : ("gym" as const)),
    })),
  member_memberships:z.object({id,member_id:id,plan_id:id,status:z.enum(["active","paused"]),expires:day,created_at:stamp}).strict(),
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
      membership_id:id.nullable().default(null),
      id,
      member_id: id,
      amount: money,
      method: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
      created_at: stamp,
      request_key: id,
      venue: venue.nullable().default(null),
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
      venue: venue.nullable().default(null),
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
  "member_memberships",
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
  "product_changes",
  "booking_requests",
] as const;
export const backupSchema = z
  .object({
    schemaVersion: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    configuration: z
      .object({
        padel_price: money,
        deposit_percent:z.number().int().min(0).max(100).default(0),payment_alias:z.string().max(100).default(""),whatsapp:z.string().max(15).default(""),revision:z.number().int().min(1).default(1),price_published:z.number().int().min(0).max(1).default(0),
        booking_days: z.number().int().min(1).max(90),
        cancel_hours: z.number().int().min(0).max(168),
      })
      .strict()
      .optional(),
    exportedAt: stamp,
    fieldNotes: z.record(z.string(), z.string()).optional(),
    records: z
      .object({
        booking_requests: z.array(row.booking_requests).optional(),
        member_memberships:z.array(row.member_memberships).optional(),
        plans: z.array(row.plans),
        members: z.array(row.members),
        payments: z.array(row.payments),
        accesses: z.array(row.accesses),
        bookings: z.array(row.bookings),
        booking_payments: z.array(row.booking_payments).optional(),
        sessions: z.array(row.sessions),
        enrollments: z.array(row.enrollments),
        audit: z.array(row.audit),
        products: z.array(row.products).optional(),
        product_changes: z.array(row.product_changes).optional(),
        cash_entries: z.array(row.cash_entries).optional(),
        stock_moves: z.array(row.stock_moves).optional(),
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
  if (
    parsed.data.schemaVersion >= 3 &&
    (!parsed.data.records.products ||
      !parsed.data.records.cash_entries ||
      !parsed.data.records.stock_moves ||
      !parsed.data.records.booking_payments)
  )
    throw Error("El respaldo versión 3 debe incluir caja y stock.");
  if(parsed.data.schemaVersion===6&&!parsed.data.records.member_memberships)throw Error("El respaldo debe incluir las membresías adicionales.");
  if (parsed.data.schemaVersion >= 5 && !parsed.data.records.booking_requests)
    throw Error("El respaldo debe incluir las solicitudes de pádel.");
  if (parsed.data.schemaVersion >= 4 && !parsed.data.records.product_changes)
    throw Error(
      "El respaldo versión 4 debe incluir el historial de productos.",
    );
  const b = {
      ...parsed.data,
      records: {
        ...parsed.data.records,
        booking_requests: parsed.data.records.booking_requests ?? [],
        member_memberships:parsed.data.records.member_memberships??[],
        products: parsed.data.records.products ?? [],
        product_changes: parsed.data.records.product_changes ?? [],
        cash_entries: parsed.data.records.cash_entries ?? [],
        stock_moves: parsed.data.records.stock_moves ?? [],
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
  const memberships=new Map(b.records.member_memberships.map(m=>[m.id,m]));
  if(b.records.member_memberships.some(mm=>!members.has(mm.member_id)||!plans.has(mm.plan_id)||b.records.members.find(m=>m.id===mm.member_id)?.plan_id===mm.plan_id)||b.records.payments.some(p=>p.membership_id!==null&&memberships.get(p.membership_id)?.member_id!==p.member_id))throw Error("El respaldo tiene membresías o cobros sin su socio y plan.");
  function unique(values: string[]) {
    if (new Set(values).size !== values.length)
      throw Error("El respaldo contiene DNI, turnos o movimientos duplicados.");
  }
  const bookings = new Map(b.records.bookings.map((b) => [b.id, b]));
  if (
    b.records.booking_requests.some(
      (r) => r.booking_id !== null && !bookings.has(r.booking_id),
    )
  )
    throw Error("El respaldo contiene solicitudes sin su reserva vinculada.");
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
  const products = new Set(b.records.products.map((p) => p.id));
  const cash = new Map(b.records.cash_entries.map((c) => [c.id, c]));
  const balances = new Map<string, number>();
  for (const c of b.records.cash_entries) {
    if (c.product_id && !products.has(c.product_id))
      throw Error("Producto de caja inexistente.");
    if (
      c.kind === "sale" &&
      (c.amount <= 0 || !c.product_id || !c.quantity || c.reverses)
    )
      throw Error("Venta inválida.");
    if (
      c.kind === "expense" &&
      (c.amount >= 0 || c.product_id || c.quantity || c.reverses)
    )
      throw Error("Gasto inválido.");
    if (c.kind === "reversal") {
      const original = cash.get(c.reverses ?? "");
      if (
        !original ||
        original.kind === "reversal" ||
        c.amount !== -original.amount ||
        c.venue !== original.venue ||
        c.product_id !== original.product_id ||
        c.quantity !== original.quantity ||
        c.method !== original.method
      )
        throw Error("Anulación inconsistente.");
    }
  }
  const transfers = new Map<string, typeof b.records.stock_moves>();
  for (const m of b.records.stock_moves) {
    if (!products.has(m.product_id))
      throw Error("Producto de stock inexistente.");
    if (m.kind === "receive") {
      if (m.quantity <= 0 || m.cash_entry_id)
        throw Error("Ingreso de stock inválido.");
    } else if (m.kind === "adjustment") {
      if (m.cash_entry_id)
        throw Error("Un ajuste no puede vincularse a un cobro.");
    } else if (m.kind === "transfer_out" || m.kind === "transfer_in") {
      if (!m.transfer_id || m.cash_entry_id) throw Error("Traslado inválido.");
      const group = transfers.get(m.transfer_id) ?? [];
      group.push(m);
      transfers.set(m.transfer_id, group);
    } else {
      const c = cash.get(m.cash_entry_id ?? "");
      if (
        !c ||
        c.kind !== m.kind ||
        c.product_id !== m.product_id ||
        c.venue !== m.venue ||
        m.quantity !== (m.kind === "sale" ? -c.quantity! : c.quantity)
      )
        throw Error("Movimiento de stock inconsistente.");
    }
    if (!["transfer_out", "transfer_in"].includes(m.kind) && m.transfer_id)
      throw Error("Referencia de traslado fuera de lugar.");
    const k = m.product_id + ":" + m.venue;
    balances.set(k, (balances.get(k) ?? 0) + m.quantity);
  }
  for (const [id, rows] of transfers) {
    const out = rows.find((m) => m.kind === "transfer_out"),
      into = rows.find((m) => m.kind === "transfer_in");
    if (
      rows.length !== 2 ||
      !out ||
      !into ||
      out.id !== id ||
      out.quantity >= 0 ||
      into.quantity !== -out.quantity ||
      out.product_id !== into.product_id ||
      out.venue === into.venue ||
      out.actor !== into.actor ||
      out.created_at !== into.created_at
    )
      throw Error(
        "El traslado no tiene una salida y una entrada coincidentes.",
      );
  }
  for (const c of b.records.product_changes) {
    if (!products.has(c.product_id))
      throw Error("Cambio de catálogo sin producto.");
    const before = JSON.parse(c.before_state),
      after = JSON.parse(c.after_state);
    if (after.revision !== before.revision + 1)
      throw Error("Revisión de producto inconsistente.");
  }
  unique(
    b.records.product_changes.map(
      (c) => c.product_id + ":" + JSON.parse(c.after_state).revision,
    ),
  );
  if ([...balances.values()].some((n) => n < 0))
    throw Error("El respaldo deja stock negativo.");
  for (const c of b.records.cash_entries.filter((c) => c.product_id))
    if (
      b.records.stock_moves.filter((m) => m.cash_entry_id === c.id).length !== 1
    )
      throw Error("Falta el movimiento de stock de una venta o anulación.");
  unique(
    b.records.cash_entries.filter((c) => c.reverses).map((c) => c.reverses!),
  );
  for (const rows of [
    b.records.products,
    b.records.cash_entries,
    b.records.stock_moves,
    b.records.product_changes,
  ])
    unique(rows.map((r) => r.request_key));
  return b;
}
