"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Field, ErrorNotice } from "@/components/club-client";
import { money, localDay, timeLabel, dateLabel } from "@/lib/club";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
type Report = {
  from: string;
  to: string;
  today: string;
  generatedAt: string;
  pageSize: number;
  paymentPage: number;
  bookingPage: number;
  methods: { method: string; activity: string; count: number; total: number }[];
  payments: {
    id: string;
    name: string;
    amount: number;
    method: string;
    created_at: string;
    activity: string;
    concept: string;
  }[];
  balances: { count: number; total: number };
  bookings: {
    id: string;
    name: string;
    day: string;
    start: number;
    court: number;
    amount: number;
    deposit: number;
  }[];
  members: { total: number; paused: number; expired: number; current: number };
};
function Pager({
  page,
  count,
  size,
  busy,
  onChange,
  label,
}: {
  page: number;
  count: number;
  size: number;
  busy: boolean;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <nav aria-label={label} className="report-pager">
      <button
        className="button small"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages} · {count}{" "}
        {count === 1 ? "registro" : "registros"}
      </span>
      <button
        className="button small"
        disabled={busy || page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
export default function ReportsClient() {
  const today = localDay();
  const [selection, setSelection] = useState({
    from: today.slice(0, 8) + "01",
    to: today,
    paymentPage: 1,
    bookingPage: 1,
  });
  const [data, setData] = useState<Report | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [revision, setRevision] = useState(0),
    [exportFile, setExportFile] = useState<{
      url: string;
      name: string;
    } | null>(null);
  useEffect(
    () => () => {
      if (exportFile) URL.revokeObjectURL(exportFile.url);
    },
    [exportFile],
  );
  const downloadLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const params = new URLSearchParams(
      Object.entries(selection).map(([k, v]) => [k, String(v)]),
    );
    void fetch("/api/reports?" + params, { signal: controller.signal })
      .then(async (r) => {
        const j = (await r.json()) as Report & { error?: string };
        if (!r.ok) throw Error(j.error || "No se pudo cargar el informe.");
        setData(j);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selection, revision]);
  const total =
      data?.methods
        .filter((m) => m.activity === "Gimnasio")
        .reduce((sum, m) => sum + m.total, 0) ?? 0,
    padelTotal =
      data?.methods
        .filter((m) => m.activity === "Pádel")
        .reduce((sum, m) => sum + m.total, 0) ?? 0,
    gymCount =
      data?.methods
        .filter((m) => m.activity === "Gimnasio")
        .reduce((sum, m) => sum + m.count, 0) ?? 0,
    count = data?.methods.reduce((sum, m) => sum + m.count, 0) ?? 0;
  async function download() {
    if (!data || downloadLock.current || busy) return;
    downloadLock.current = true;
    setExporting(true);
    setError("");
    try {
      const r = await fetch(
        "/api/reports?" +
          new URLSearchParams({ from: data.from, to: data.to, format: "csv" }),
      );
      if (!r.ok) {
        const j = (await r.json()) as { error?: string };
        throw Error(j.error || "No se pudo exportar.");
      }
      const u = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = u;
      a.download = `gold-gym-cobros-${data.from}-${data.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setExportFile({ url: u, name: a.download });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      downloadLock.current = false;
      setExporting(false);
    }
  }
  return (
    <main className="workspace report-workspace">
      <Link className="text-link" href="/gestion">
        ← Gestión
      </Link>
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / ADMINISTRACIÓN</p>
          <h1>Los números del club.</h1>
          <p className="muted">
            Cobros de cuotas y pádel, saldos de reservas y estado de las membresías.
          </p>
        </div>
        <Link className="button" href="/caja">Caja completa · ventas y gastos</Link>
      </header>
      <form
        className="panel report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setSelection({
            from: String(form.get("from")),
            to: String(form.get("to")),
            paymentPage: 1,
            bookingPage: 1,
          });
          setRevision((v) => v + 1);
        }}
      >
        <Field label="Desde">
          <input
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            name="from"
            defaultValue={today.slice(0, 8) + "01"}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            name="to"
            defaultValue={today}
          />
        </Field>
        <button className="button gold" disabled={busy}>
          {busy ? "Consultando…" : "Consultar período"}
        </button>
      </form>
      <ErrorNotice error={error} />
      <p role="status" className="muted report-status">
        {busy
          ? "Actualizando informe…"
          : data
            ? `Período ${dateLabel(data.from)} ${data.from.slice(0, 4)} al ${dateLabel(data.to)} ${data.to.slice(0, 4)} · Hora de Argentina`
            : ""}
      </p>
      {data && (
        <div
          aria-busy={busy}
          className={busy ? "report-results report-updating" : "report-results"}
        >
          <section className="report-stats" aria-label="Resumen del período">
            <div className="panel">
              <p>Cobros de gimnasio</p>
              <strong>{money(total)}</strong>
              <span>
                {gymCount}{" "}
                {gymCount === 1 ? "pago registrado" : "pagos registrados"} en el
                período
              </span>
            </div>
            <div className="panel">
              <p>Cobros detallados de pádel</p>
              <strong>{money(padelTotal)}</strong>
              <span>Señas y saldos recibidos en el período</span>
            </div>
            <div className="panel">
              <p>Saldo pendiente de pádel</p>
              <strong>{money(data.balances.total)}</strong>
              <span>
                {data.balances.count}{" "}
                {data.balances.count === 1
                  ? "reserva confirmada"
                  : "reservas confirmadas"}{" "}
                con fecha en el período
              </span>
            </div>
            <div className="panel">
              <p>Membresías vencidas hoy</p>
              <strong>{data.members.expired}</strong>
              <span>
                Vigentes: {data.members.current} · Pausadas:{" "}
                {data.members.paused} · Socios: {data.members.total}
              </span>
            </div>
          </section>
          <section className="panel">
            <div className="report-section-heading">
              <h2>Cobros registrados</h2>
              <button
                className="button small"
                disabled={busy || exporting || count === 0}
                onClick={() => void download()}
              >
                {exporting ? "Preparando…" : "Descargar cobros CSV"}
              </button>
            </div>
            <p className="muted">
              Incluye cuotas de gimnasio y cobros detallados de pádel recibidos
              durante el período. Es un control interno; no reemplaza un
              comprobante fiscal ni un cierre de caja.
            </p>
            {exportFile && (
              <p className="muted" role="status">
                Archivo preparado:{" "}
                <a
                  className="text-link"
                  href={exportFile.url}
                  download={exportFile.name}
                >
                  {exportFile.name}
                </a>
                . Si la descarga no comenzó, abrí este enlace.
              </p>
            )}
            <p className="muted">
              El detalle de pádel comienza con esta función. Los pagos
              anteriores conservan su importe en cada reserva, pero no se
              reconstruyen fechas ni medios de pago. Una cancelación no registra
              una devolución: estos importes son cobros brutos.
            </p>
            <div className="report-methods">
              {data.methods.map((m) => (
                <p key={m.activity + m.method}>
                  <span>
                    {m.activity} · {m.method} · {m.count}
                  </span>
                  <strong>{money(m.total)}</strong>
                </p>
              ))}
            </div>
            {data.payments.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha (Argentina)</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Actividad</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead>Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {new Intl.DateTimeFormat("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          dateStyle: "short",
                          timeStyle: "short",
                          hourCycle: "h23",
                        }).format(new Date(p.created_at))}
                      </TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        {p.activity} · {p.concept}
                      </TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell>{money(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="empty">
                No hay cobros para mostrar en esta página.
              </p>
            )}
            <Pager
              label="Páginas de cobros"
              page={data.paymentPage}
              size={data.pageSize}
              count={count}
              busy={busy}
              onChange={(paymentPage) =>
                setSelection((s) => ({ ...s, paymentPage }))
              }
            />
          </section>
          <section className="panel">
            <h2>Saldos pendientes de pádel</h2>
            <p className="muted">
              Reservas confirmadas cuya fecha de juego está en el período. El
              saldo refleja lo pendiente ahora; se excluyen bloqueos y
              cancelaciones. No representa ingresos cobrados durante esas
              fechas.
            </p>
            {data.bookings.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turno</TableHead>
                    <TableHead>Reserva</TableHead>
                    <TableHead>Cancha</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pagado</TableHead>
                    <TableHead>Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        {dateLabel(b.day)} · {timeLabel(b.start)}
                      </TableCell>
                      <TableCell>{b.name}</TableCell>
                      <TableCell>{b.court}</TableCell>
                      <TableCell>{money(b.amount)}</TableCell>
                      <TableCell>{money(b.deposit)}</TableCell>
                      <TableCell>{money(b.amount - b.deposit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="empty">
                No hay saldos pendientes para mostrar en esta página.
              </p>
            )}
            <Pager
              label="Páginas de saldos"
              page={data.bookingPage}
              size={data.pageSize}
              count={data.balances.count}
              busy={busy}
              onChange={(bookingPage) =>
                setSelection((s) => ({ ...s, bookingPage }))
              }
            />
            <Link className="text-link" href="/reservas">
              Abrir agenda para registrar un saldo →
            </Link>
          </section>
          <p className="muted">
            Informe consultado el{" "}
            {new Intl.DateTimeFormat("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              dateStyle: "short",
              timeStyle: "short",
              hourCycle: "h23",
            }).format(new Date(data.generatedAt))}
            . Las membresías vencidas se cuentan al {dateLabel(data.today)}; no
            se calcula una deuda monetaria por no renovar.
          </p>
        </div>
      )}
    </main>
  );
}

