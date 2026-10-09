export type Plan = {
  id: string;
  name: string;
  price: number;
  days: number;
  access_scope?: "gym" | "pilates" | "all";
};
export type MemberMembership = {
  id: string;
  member_id: string;
  plan_id: string;
  status: string;
  expires: string;
  plan_name: string;
  price: number;
  days: number;
  access_scope: string;
};
export type Member = {
  id: string;
  name: string;
  dni: string;
  phone: string;
  plan_id: string;
  status: string;
  expires: string;
  created_at: string;
  plan_name: string;
  price: number;
};
export type Payment = {
  id: string;
  member_id: string;
  name: string;
  amount: number;
  method: string;
  created_at: string;
};
export type Access = {
  id: string;
  name: string;
  allowed: number;
  reason: string;
  venue: string;
  created_at: string;
};
export type Booking = {
  id: string;
  court: number;
  day: string;
  start: number;
  name: string;
  phone: string;
  kind: string;
  status: string;
  amount: number;
  deposit: number;
  created_at: string;
};
export type Session = {
  id: string;
  name: string;
  day: string;
  time: string;
  capacity: number;
  venue: string;
  enrolled: number;
};
export type Enrollment = {
  id: string;
  session_id: string;
  member_id: string;
  name: string;
};
export type Audit = {
  id: string;
  action: string;
  detail: string;
  created_at: string;
};
export type ClubData = {
  role: "owner" | "reception";
  plans: Plan[];
  members: Member[];
  memberships: MemberMembership[];
  payments: Payment[];
  accesses: Access[];
  bookings: Booking[];
  sessions: Session[];
  enrollments: Enrollment[];
  audit: Audit[];
  today: string;
};
export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(day: string, days: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export const slots = Array.from({ length: 10 }, (_, i) => 480 + i * 90);
export function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
export function dateLabel(day: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
  }).format(new Date(day + "T12:00:00Z"));
}
export function accessDecision(
  member: {
    status: string;
    expires: string;
    access_scope?: string;
  } | null,
  day: string,
  venue?: string,
) {
  if (!member) return { allowed: false, reason: "DNI no registrado" };
  if (member.status !== "active")
    return { allowed: false, reason: "Membresía pausada" };
  if (member.expires < day) return { allowed: false, reason: "Cuota vencida" };
  if (venue) {
    const scope = member.access_scope;
    if (!["gym", "pilates", "all"].includes(scope ?? ""))
      return {
        allowed: false,
        reason: "Recepción debe revisar los accesos de tu plan",
      };
    if (scope !== "all" && (venue === "Pilates") !== (scope === "pilates"))
      return {
        allowed: false,
        reason:
          scope === "pilates"
            ? "Tu plan es exclusivo de Pilates"
            : "Tu plan no incluye Pilates",
      };
  }
  const daysRemaining = Math.round(
    (Date.parse(member.expires + "T12:00:00Z") -
      Date.parse(day + "T12:00:00Z")) /
      86400000,
  );
  const warning =
    daysRemaining <= 7
      ? daysRemaining === 0
        ? "Tu cuota vence hoy. Acercate a recepción para renovarla."
        : `Tu cuota vence en ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}. Acercate a recepción para renovarla.`
      : null;
  return { allowed: true, reason: "Membresía vigente", warning, daysRemaining };
}
export function isValidDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day + "T12:00:00Z")) &&
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day
  );
}
// getRandomValues also works in local HTTP previews; production uses native UUIDs.
export function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function slotPassed(day: string, minutes: number, now = new Date()) {
  const today = localDay(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [hours, mins] = time.split(":").map(Number);
  return day < today || (day === today && minutes <= hours * 60 + mins);
}

export function accessForMemberships(
  memberships: { status: string; expires: string; access_scope?: string }[],
  day: string,
  venue: string,
) {
  const included = memberships.filter(
    (m) =>
      m.access_scope === "all" ||
      (venue === "Pilates"
        ? m.access_scope === "pilates"
        : m.access_scope === "gym"),
  );
  const ordered = [...(included.length ? included : memberships)].sort(
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") ||
      b.expires.localeCompare(a.expires),
  );
  const selected = ordered[0] ?? null;
  return {
    ...accessDecision(selected, day, venue),
    expires: selected?.expires ?? null,
  };
}
