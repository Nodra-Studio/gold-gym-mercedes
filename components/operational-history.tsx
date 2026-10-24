"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { localDay } from "@/lib/club";
import { Field, ErrorNotice } from "@/components/club-client";
const labels: Record<string, string> = {
  staff: "Equipo",
  members: "Socios",
  plans: "Planes",
  member_memberships: "Membresías",
  payments: "Cobros de socios",
  bookings: "Reservas",
  booking_payments: "Cobros de pádel",
  sessions: "Clases",
  enrollments: "Inscripciones",
  products: "Productos",
  cash_entries: "Caja",
  stock_moves: "Stock",
  settings: "Reglas del club",
  issuer_settings: "Datos fiscales",
};
const fields: Record<string, string> = {
  name: "Nombre",
  dni: "DNI",
  phone: "Teléfono",
  amount: "Importe",
  price: "Precio",
  days: "Duración en días",
  method: "Medio de pago",
  venue: "Sede",
  home_branch: "Sede del socio",
  activity: "Actividad",
  activity_scope: "Actividades permitidas",
  branch_scope: "Sedes permitidas",
  status: "Estado",
  role: "Rol",
  expires: "Vigencia",
  deposit: "Total cobrado",
  category: "Categoría",
  concept: "Concepto",
  quantity: "Cantidad",
  court: "Cancha",
  day: "Día",
  start: "Inicio",
  time: "Hora",
  capacity: "Cupo",
  active: "Activo",
  voided: "Anulado",
  access_scope: "Accesos del plan",
  published: "Publicado",
  plan_id: "Plan",
  member_id: "Socio",
  session_id: "Clase",
  booking_days: "Anticipación de reservas",
  cancel_hours: "Plazo de cancelación",
  padel_price: "Precio de pádel",
  legal_name: "Razón social",
  tax_id: "CUIT",
  fiscal_address: "Domicilio fiscal",
  point_of_sale: "Punto de venta",
  tax_condition: "Condición fiscal",
};
type Change = {
  id: string;
  table_name: string;
  operation: string;
  entity_id: string;
  before_state: string | null;
  after_state: string | null;
  actor: string | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
};
function changes(row: Change) {
  const before = row.before_state ? JSON.parse(row.before_state) : {},
    after = row.after_state ? JSON.parse(row.after_state) : {};
  return Object.keys(fields)
    .filter((k) => before[k] !== after[k] && (k in before || k in after))
    .map((k) => ({
      label: fields[k],
      before: before[k] ?? "—",
      after: after[k] ?? "—",
    }));
}
export default function OperationalHistory() {
  const today = localDay(),
    [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [table, setTable] = useState(""),
    [offset, setOffset] = useState(0),
    [selection, setSelection] = useState({ from, to, table, offset }),
    [data, setData] = useState<{ entries: Change[]; hasMore: boolean } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void apiFetch(
      "/api/history?" +
        new URLSearchParams({ ...selection, offset: String(selection.offset) }),
      { signal: controller.signal },
    )
      .then(async (r) => {
        const j = (await r.json()) as {
          entries: Change[];
          hasMore: boolean;
          error?: string;
        };
        if (!r.ok) throw Error(j.error);
        if (!controller.signal.aborted) setData(j);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selection]);
  return (
    <section className="panel operational-history">
      <h2>Historial de operaciones</h2>
      <p className="muted">
        Cada operación nueva conserva sus datos anteriores y posteriores. Los
        registros previos a la incorporación del historial siguen disponibles en
        las auditorías existentes.
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setSelection({ from, to, table, offset: 0 });
        }}
      >
        <Field label="Desde">
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="Área">
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">Todas las áreas</option>
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <button className="button" disabled={busy}>
            Consultar historial
          </button>
        </div>
      </form>
      <ErrorNotice error={error} />
      {busy ? (
        <p role="status">Cargando historial…</p>
      ) : data && !data.entries.length ? (
        <p>No hay operaciones registradas en este período.</p>
      ) : (
        data?.entries.map((row) => (
          <details key={row.id} className="history-row">
            <summary>
              <strong>
                {labels[row.table_name] ?? row.table_name} ·{" "}
                {
                  { INSERT: "Alta", UPDATE: "Cambio", DELETE: "Baja" }[
                    row.operation
                  ]
                }
              </strong>
              <span>
                {new Intl.DateTimeFormat("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.created_at))}
              </span>
            </summary>
            <p>
              Operador:{" "}
              {row.actor_name ??
                row.actor ??
                "Sin operador identificado en el registro de origen"}
            </p>
            {row.reason && <p>Motivo: {row.reason}</p>}
            <dl>
              {changes(row).map((c) => (
                <div key={c.label}>
                  <dt>{c.label}</dt>
                  <dd>
                    {String(c.before)} → {String(c.after)}
                  </dd>
                </div>
              ))}
            </dl>
            <small className="muted">Referencia: {row.entity_id}</small>
          </details>
        ))
      )}
      <div className="form-actions">
        <button
          className="button small"
          disabled={busy || offset === 0}
          onClick={() => {
            const value = Math.max(0, offset - 50);
            setOffset(value);
            setSelection((s) => ({ ...s, offset: value }));
          }}
        >
          Anterior
        </button>
        <button
          className="button small"
          disabled={busy || !data?.hasMore}
          onClick={() => {
            const value = offset + 50;
            setOffset(value);
            setSelection((s) => ({ ...s, offset: value }));
          }}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
