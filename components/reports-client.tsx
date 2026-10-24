"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import OperationalHistory from "@/components/operational-history";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api-fetch";
import { Field, ErrorNotice } from "@/components/club-client";
import { money, localDay } from "@/lib/club";
import { branches, branchName } from "@/lib/branches";
import {
  percentageChange,
  reportActivities,
  type FinancialReport,
  type FinancialGroup,
  type ReportSelection,
} from "@/lib/reporting";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import "./reports.css";
import ReportsDetails from "./reports-details";
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    dateStyle: "short",
  }).format(new Date(day + "T00:00:00Z"));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }).format(new Date(month + "-01T00:00:00Z"));
const rangeLabel = (from: string, to: string) =>
  `${dayLabel(from)} al ${dayLabel(to)}`;
const shortMoney = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
function initialSelection(): ReportSelection {
  const today = localDay(),
    from = today.slice(0, 8) + "01",
    days = (Date.parse(today) - Date.parse(from)) / 86400000 + 1;
  const shift = (n: number) =>
    new Date(Date.parse(from) + n * 86400000).toISOString().slice(0, 10);
  return {
    from,
    to: today,
    compareFrom: shift(-days),
    compareTo: shift(-1),
    venue: "",
    activity: "",
    category: "",
  };
}
function Delta({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous,
    pct = percentageChange(current, previous);
  return (
    <span className="financial-delta">
      {delta > 0 ? "+" : ""}
      {money(delta)} ·{" "}
      {pct === null
        ? "sin base porcentual"
        : `${pct > 0 ? "+" : ""}${pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
    </span>
  );
}
function Breakdown({
  title,
  rows,
  comparison,
  label,
}: {
  title: string;
  rows: FinancialGroup[];
  comparison: FinancialGroup[];
  label: (key: string) => string;
}) {
  const keys = [
    ...new Set([...rows.map((r) => r.key), ...comparison.map((r) => r.key)]),
  ];
  return (
    <section className="panel financial-breakdown">
      <h2>{title}</h2>
      {keys.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {title === "Por sede" ? "Sede" : "Categoría"}
              </TableHead>
              <TableHead>Ingresos</TableHead>
              <TableHead>Gastos</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Variación del resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const now = rows.find((r) => r.key === key),
                before = comparison.find((r) => r.key === key);
              return (
                <TableRow key={key}>
                  <TableCell>{label(key)}</TableCell>
                  <TableCell>{money(now?.incoming ?? 0)}</TableCell>
                  <TableCell>{money(now?.outgoing ?? 0)}</TableCell>
                  <TableCell>{money(now?.balance ?? 0)}</TableCell>
                  <TableCell>
                    <Delta
                      current={now?.balance ?? 0}
                      previous={before?.balance ?? 0}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="empty">No hay movimientos para estos filtros.</p>
      )}
    </section>
  );
}
export default function ReportsClient() {
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState<ReportSelection>(initialSelection),
    [selection, setSelection] = useState<ReportSelection>(initialSelection),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<FinancialReport | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ ...selection, view: "financial" });
    void apiFetch("/api/reports?" + params, { signal: controller.signal })
      .then(async (r) => {
        const result = (await r.json()) as FinancialReport & { error?: string };
        if (!r.ok) throw Error(result.error || "No se pudo cargar el informe.");
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el informe.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selection, revision]);
  const set = (key: keyof ReportSelection, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function selectMonth(month: string) {
    if (!/^\d{4}-\d\d$/.test(month)) return;
    const [year, m] = month.split("-").map(Number),
      from = month + "-01",
      to = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
    const compareFrom = new Date(Date.UTC(year, m - 2, 1))
        .toISOString()
        .slice(0, 10),
      compareTo = new Date(Date.UTC(year, m - 1, 0)).toISOString().slice(0, 10);
    setDraft((d) => ({ ...d, from, to, compareFrom, compareTo }));
  }
  async function download() {
    if (!data || busy || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setError("");
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await apiFetch(
        "/api/reports?" +
          new URLSearchParams({
            ...data.selection,
            view: "financial",
            format: "csv",
          }),
        { signal: controller.signal },
      );
      if (!r.ok) {
        const j = (await r.json()) as { error?: string };
        throw Error(j.error || "No se pudo exportar.");
      }
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `gold-gym-informe-${data.selection.from}-${data.selection.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "La exportación tardó demasiado. Volvé a intentar."
          : e instanceof Error
            ? e.message
            : "No se pudo exportar.",
      );
    } finally {
      clearTimeout(timeout);
      exportLock.current = false;
      setExporting(false);
    }
  }
  const metrics = data
    ? ([
        { key: "incoming", title: "Ingresos cobrados" },
        { key: "outgoing", title: "Gastos registrados" },
        { key: "balance", title: "Resultado de caja" },
      ] as const)
    : [];
  if (showDetails)
    return (
      <>
        <div className="financial-back">
          <button className="button" onClick={() => setShowDetails(false)}>
            ← Volver al informe comparativo
          </button>
        </div>
        <ReportsDetails />
      </>
    );
  return (
    <main className="workspace report-workspace financial-workspace">
      <Link className="text-link" href="/gestion">
        ← Gestión
      </Link>
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / INFORMES</p>
          <h1>Los números del club.</h1>
          <p className="muted">
            Compará períodos y explorá ingresos, gastos y resultados por sede y
            actividad.
          </p>
        </div>
        <div className="financial-header-actions">
          <button className="button" onClick={() => setShowDetails(true)}>
            Cobros y saldos detallados
          </button>
          <Link className="button" href="/caja">
            Ver movimientos de caja
          </Link>
        </div>
      </header>
      <form
        className="panel financial-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setSelection({ ...draft });
          setRevision((r) => r + 1);
        }}
      >
        <div className="financial-filter-heading">
          <div>
            <h2>Períodos y filtros</h2>
            <p className="muted">
              Las fechas incluyen ambos días y usan la hora de Argentina.
            </p>
          </div>
          <Field label="Elegir un mes completo">
            <input
              type="month"
              min="2000-02"
              max="2100-12"
              onChange={(e) => selectMonth(e.target.value)}
            />
          </Field>
        </div>
        <div className="financial-period-fields">
          <fieldset>
            <legend>Período actual</legend>
            <div>
              <Field label="Desde">
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={draft.from}
                  onChange={(e) => set("from", e.target.value)}
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="date"
                  required
                  min={draft.from}
                  max="2100-12-31"
                  value={draft.to}
                  onChange={(e) => set("to", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>
          <fieldset>
            <legend>Comparar con</legend>
            <div>
              <Field label="Desde">
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={draft.compareFrom}
                  onChange={(e) => set("compareFrom", e.target.value)}
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="date"
                  required
                  min={draft.compareFrom}
                  max="2100-12-31"
                  value={draft.compareTo}
                  onChange={(e) => set("compareTo", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>
        </div>
        <div className="financial-dimension-fields">
          <Field label="Sede">
            <select
              value={draft.venue}
              onChange={(e) => set("venue", e.target.value)}
            >
              <option value="">Todas las sedes</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="unknown">Sin sede registrada</option>
            </select>
          </Field>
          <Field label="Actividad">
            <select
              value={draft.activity}
              onChange={(e) => set("activity", e.target.value)}
            >
              <option value="">Todas las actividades</option>
              {reportActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {[
                ...new Set([
                  ...(data?.categoryOptions ?? []),
                  ...(draft.category ? [draft.category] : []),
                ]),
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <button className="button gold" disabled={busy}>
            {busy ? "Consultando…" : "Aplicar filtros"}
          </button>
        </div>
      </form>
      <ErrorNotice error={error} />
      <p role="status" className="muted report-status">
        {busy
          ? "Actualizando informe…"
          : data
            ? `${rangeLabel(data.current.from, data.current.to)} · comparación: ${rangeLabel(data.comparison.from, data.comparison.to)}`
            : ""}
      </p>
      {data && (
        <div
          aria-busy={busy}
          className={busy ? "report-results report-updating" : "report-results"}
        >
          <section
            className="financial-summary"
            aria-label="Resumen comparativo"
          >
            {metrics.map((metric) => (
              <article className="panel" key={metric.key}>
                <p>{metric.title}</p>
                <strong>{money(data.current.totals[metric.key])}</strong>
                <span>
                  Comparación: {money(data.comparison.totals[metric.key])}
                </span>
                <Delta
                  current={data.current.totals[metric.key]}
                  previous={data.comparison.totals[metric.key]}
                />
              </article>
            ))}
          </section>
          <p className="notice financial-explanation">
            Resultado de caja = ingresos cobrados menos gastos registrados. Es
            un resultado de los movimientos cargados, no una ganancia contable.
            Los períodos tienen {data.current.days} y {data.comparison.days}{" "}
            días respectivamente; las variaciones muestran importes totales.
          </p>
          <div className="financial-charts">
            <section className="panel">
              <h2>Evolución del período actual</h2>
              <p className="muted">
                Ingresos y gastos agrupados por mes. Los meses de los extremos
                pueden estar incompletos.
              </p>
              <div
                className="financial-chart"
                role="img"
                aria-label="Gráfico mensual de ingresos y gastos. Los valores también están en la tabla por mes."
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data.current.months}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="key"
                      tickFormatter={monthLabel}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={shortMoney}
                      width={62}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      labelFormatter={(label) => monthLabel(String(label))}
                      formatter={(value) => money(Number(value))}
                    />
                    <Legend />
                    <Bar
                      dataKey="incoming"
                      name="Ingresos"
                      fill="#526c42"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="outgoing"
                      name="Gastos"
                      fill="#a34e36"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel">
              <h2>Un período frente al otro</h2>
              <p className="muted">
                Actual: {rangeLabel(data.current.from, data.current.to)}
                <br />
                Comparación:{" "}
                {rangeLabel(data.comparison.from, data.comparison.to)}
              </p>
              <div
                className="financial-chart"
                role="img"
                aria-label="Gráfico comparativo de ingresos, gastos y resultado. Los importes se muestran en el resumen."
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={metrics.map((m) => ({
                      name: m.title
                        .replace(" cobrados", "")
                        .replace(" registrados", "")
                        .replace(" de caja", ""),
                      current: data.current.totals[m.key],
                      previous: data.comparison.totals[m.key],
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={shortMoney}
                      width={62}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value) => money(Number(value))} />
                    <Legend />
                    <Bar
                      dataKey="current"
                      name="Actual"
                      fill="#526c42"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="previous"
                      name="Comparación"
                      fill="#947021"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
          <Breakdown
            title="Por sede"
            rows={data.current.venues}
            comparison={data.comparison.venues}
            label={branchName}
          />
          <Breakdown
            title="Por categoría"
            rows={data.current.categories}
            comparison={data.comparison.categories}
            label={(key) => key}
          />
          <section className="panel">
            <div className="report-section-heading">
              <h2>Detalle mes a mes</h2>
              <button
                className="button small"
                disabled={busy || exporting}
                onClick={() => void download()}
              >
                {exporting ? "Preparando…" : "Descargar informe CSV"}
              </button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Mes</TableHead>
                  <TableHead>Ingresos</TableHead>
                  <TableHead>Gastos</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Actual", data.current],
                  ["Comparación", data.comparison],
                ].flatMap(([name, p]) =>
                  typeof p !== "string"
                    ? p.months.map((m) => (
                        <TableRow key={String(name) + m.key}>
                          <TableCell>{String(name)}</TableCell>
                          <TableCell>{monthLabel(m.key)}</TableCell>
                          <TableCell>{money(m.incoming)}</TableCell>
                          <TableCell>{money(m.outgoing)}</TableCell>
                          <TableCell>{money(m.balance)}</TableCell>
                        </TableRow>
                      ))
                    : [],
                )}
              </TableBody>
            </Table>
          </section>
          <p className="muted financial-footnote">
            Los cobros corregidos se muestran con sus datos vigentes en la fecha
            original del cobro; las anulaciones de caja se computan en la fecha
            de la anulación. El historial conserva los cambios. Los movimientos
            históricos sin sede o actividad identificada se mantienen en sus
            grupos, sin asignarlos a una sede por suposición. Consultado el{" "}
            {new Intl.DateTimeFormat("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(data.generatedAt))}
            .
          </p>
        </div>
      )}
      <OperationalHistory />
    </main>
  );
}
