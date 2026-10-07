import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  days: integer("days").notNull(),
});
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    dni: text("dni").notNull(),
    phone: text("phone").notNull().default(""),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("active"),
    expires: text("expires").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("members_owner_dni").on(t.owner, t.dni),
    index("members_owner_expiry").on(t.owner, t.expires),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    venue: text("venue"),
    createdAt: text("created_at").notNull(),
    requestKey: text("request_key").notNull(),
  },
  (t) => [
    uniqueIndex("payments_owner_request").on(t.owner, t.requestKey),
    index("payments_owner_date").on(t.owner, t.createdAt),
  ],
);
export const accesses = sqliteTable(
  "accesses",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    memberId: text("member_id"),
    name: text("name").notNull(),
    allowed: integer("allowed").notNull(),
    reason: text("reason").notNull(),
    venue: text("venue").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("accesses_owner_date").on(t.owner, t.createdAt)],
);
export const bookings = sqliteTable(
  "bookings",
  {
    createdBy: text("created_by"),
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    court: integer("court").notNull(),
    day: text("day").notNull(),
    start: integer("start").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    kind: text("kind").notNull().default("booking"),
    status: text("status").notNull().default("confirmed"),
    amount: integer("amount").notNull().default(0),
    deposit: integer("deposit").notNull().default(0),
    createdAt: text("created_at").notNull(),
    requestKey: text("request_key").notNull(),
  },
  (t) => [
    uniqueIndex("bookings_active_slot")
      .on(t.owner, t.court, t.day, t.start)
      .where(sql`${t.status} = 'confirmed'`),
    uniqueIndex("bookings_owner_request").on(t.owner, t.requestKey),
    index("bookings_owner_day").on(t.owner, t.day),
  ],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    day: text("day").notNull(),
    time: text("time").notNull(),
    capacity: integer("capacity").notNull(),
    venue: text("venue").notNull(),
  },
  (t) => [index("sessions_owner_day").on(t.owner, t.day)],
);
export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
  },
  (t) => [
    uniqueIndex("enrollments_session_member").on(t.sessionId, t.memberId),
  ],
);
export const audit = sqliteTable(
  "audit",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    action: text("action").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_owner_date").on(t.owner, t.createdAt)],
);

export const staff = sqliteTable(
  "staff",
  {
    userId: text("user_id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("staff_owner").on(t.owner)],
);
export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    requestKey: text("request_key").notNull(),
    count: integer("count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("imports_owner_request").on(t.owner, t.requestKey)],
);
export const restores = sqliteTable("restores", {
  owner: text("owner").primaryKey(),
  requestKey: text("request_key").notNull(),
  count: integer("count").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  owner: text("owner").primaryKey(),
  padelPrice: integer("padel_price").notNull().default(24000),
  bookingDays: integer("booking_days").notNull().default(30),
  cancelHours: integer("cancel_hours").notNull().default(24),
});

export const bookingPayments = sqliteTable(
  "booking_payments",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    venue: text("venue"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("booking_payments_kind").on(t.owner, t.bookingId, t.kind),
    index("booking_payments_owner_date").on(t.owner, t.createdAt),
  ],
);

// Production constraints and atomic stock operations live in supabase/migrations.
const cashCommon = () => ({
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  createdAt: text("created_at").notNull(),
  actor: text("actor").notNull(),
  requestKey: text("request_key").notNull(),
  payload: text("payload").notNull(),
});
export const products = sqliteTable(
  "products",
  {
    ...cashCommon(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    price: integer("price").notNull(),
    active: integer("active").notNull().default(1),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [uniqueIndex("products_owner_request").on(t.owner, t.requestKey)],
);
export const cashEntries = sqliteTable(
  "cash_entries",
  {
    ...cashCommon(),
    venue: text("venue").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    concept: text("concept").notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    day: text("day").notNull(),
    productId: text("product_id").references(() => products.id),
    quantity: integer("quantity"),
    reverses: text("reverses"),
  },
  (t) => [
    uniqueIndex("cash_entries_owner_request").on(t.owner, t.requestKey),
    uniqueIndex("cash_entries_owner_reversal").on(t.owner, t.reverses),
    index("cash_entries_owner_day").on(t.owner, t.day, t.venue),
  ],
);
export const stockMoves = sqliteTable(
  "stock_moves",
  {
    ...cashCommon(),
    venue: text("venue").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    kind: text("kind").notNull(),
    note: text("note").notNull(),
    transferId: text("transfer_id"),
    cashEntryId: text("cash_entry_id").references(() => cashEntries.id),
  },
  (t) => [
    uniqueIndex("stock_moves_owner_request").on(t.owner, t.requestKey),
    index("stock_moves_owner_product").on(t.owner, t.productId, t.venue),
  ],
);

export const productChanges = sqliteTable(
  "product_changes",
  {
    ...cashCommon(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    beforeState: text("before_state").notNull(),
    afterState: text("after_state").notNull(),
  },
  (t) => [
    uniqueIndex("product_changes_owner_request").on(t.owner, t.requestKey),
    index("product_changes_owner_product").on(
      t.owner,
      t.productId,
      t.createdAt,
    ),
  ],
);
