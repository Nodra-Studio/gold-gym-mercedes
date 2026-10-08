"use client";
import { branches } from "@/lib/branches";
import { apiFetch } from "@/lib/api-fetch";
import { csvDocument } from "@/lib/csv";
import { requestId } from "@/lib/club";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LoaderCircle,
  Plus,
  RefreshCw,
  Download,
  Check,
  Users,
  CalendarDays,
  ScanLine,
  CreditCard,
  Pencil,
  Search,
  BarChart3,
  Settings,
  ShieldCheck,
  Database,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  type ClubData,
  type Plan,
  type Member,
  type Session,
  localDay,
  addDays,
  money,
  dateLabel,
} from "@/lib/club";
export function useClub() {
  const [data, setData] = useState<ClubData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const load = useCallback(async (silent = false) => {
    const ticket = ++sequence.current;
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    if (!silent) setLoading(true);
    try {
      const r = await apiFetch("/api/club", { cache: "no-store", signal: controller.signal }),
        j = (await r.json()) as ClubData & {
          error?: string;
        };
      if (!r.ok) throw Error(j.error);
      if (ticket !== sequence.current) return;
      setData(j);
      setError("");
    } catch (e) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setError(e instanceof Error ? e.message : "No pudimos cargar los datos.");
    } finally {
      if (ticket === sequence.current) {
        pendingRead.current = null;
        setLoading(false);
      }
    }
  }, []);
  const refresh = useCallback(() => load(), [load]);
  // Initial remote load; state changes only after the asynchronous request resolves.
  useEffect(() => {
    // Loading belongs to this remote request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      sequence.current++;
      pendingRead.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (busy) return;
    const sync = () => {
      if (document.visibilityState === "visible" && !saving.current && !pendingRead.current) void load(true);
    };
    const timer = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [busy, load]);
  async function mutate(payload: Record<string, unknown>) {
    if (saving.current) throw new Error("Esperá a que termine la operación en curso.");
    saving.current = true;
    sequence.current++;
    pendingRead.current?.abort();
    pendingRead.current = null;
    setLoading(false);
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/club", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        j = (await r.json()) as {
          error?: string;
          ok?: boolean;
        };
      if (!r.ok) throw Error(j.error);
      await refresh();
      return j;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los cambios.",
      );
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return { data, error, loading, busy, refresh, mutate, setError };
}
export function WorkspaceHeader({
  active,
  title,
  subtitle,
}: {
  active: "gestion" | "reservas" | "caja";
  title: string;
  subtitle: string;
}) {
  return (
    <header className="work-header">
      <div>
        <p className="eyebrow">
          {active === "gestion"
            ? "SOCIOS Y GIMNASIO"
            : active === "reservas"
              ? "CLUB UNIÓN / PÁDEL"
              : "ADMINISTRACIÓN / CAJA"}
        </p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <span className="workspace-badge">Gold Gym · Mercedes</span>
    </header>
  );
}
export function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"field" + (full ? " full" : "")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function SelectField({
  value,
  onChange,
  children,
  required = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
    >
      {children}
    </NativeSelect>
  );
}
export const Option = NativeSelectOption;
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      {error}
      {error.includes("Iniciá sesión") && (
        <a
          className="text-link"
          href="/signin-with-chatgpt?return_to=%2Fgestion"
          target="_top"
        >
          Iniciar sesión
        </a>
      )}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle
        className="animate-spin"
        style={{ margin: "0 auto 15px" }}
      />
      Cargando el club…
    </div>
  );
}
export function FormModal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function SaveButton({
  busy,
  children = "Guardar",
}: {
  busy: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button className="button gold small" type="submit" disabled={busy}>
      {busy ? (
        <LoaderCircle className="animate-spin" size={17} />
      ) : (
        <Check size={17} />
      )}{" "}
      {busy ? "Guardando…" : children}
    </button>
  );
}
function downloadCsv(data: ClubData) {
  const lines = [
    ["Nombre", "DNI", "Teléfono", "Plan", "Estado", "Vencimiento"],
    ...data.members.map((m) => [
      m.name,
      m.dni,
      m.phone,
      m.plan_name,
      m.status,
      m.expires,
    ]),
  ];
  const u = URL.createObjectURL(
    new Blob([csvDocument(lines)], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = `gold-gym-socios-${data.today}.csv`;
  a.click();
  URL.revokeObjectURL(u);
}
export default function ClubDashboard() {
  const club = useClub(),
    { data, error, busy, loading, refresh, mutate, setError } = club;
  const [tab, setTab] = useState("resumen"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<
      "member" | "payment" | "plan" | "price" | "session" | "enroll" | null
    >(null),
    [selected, setSelected] = useState<Member | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [success, setSuccess] = useState("");
  const [pricePlan, setPricePlan] = useState<Plan | null>(null);
  const open = (m: typeof modal, member: Member | null = null) => {
    setSelected(member);
    setError("");
    setSuccess("");
    setModal(m);
  };
  async function submit(p: Record<string, unknown>) {
    try {
      await mutate(p);
      setModal(null);
      setSuccess("Cambios guardados.");
    } catch {}
  }
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(t);
  }, [success]);
  useEffect(() => {
    const ctx = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => void;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const controller = new AbortController();
    try {
      ctx.registerTool(
        {
          name: "read_club_summary",
          description:
            "Lee un resumen del espacio privado del club. No modifica registros.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("No acepta parámetros.");
            const r = await apiFetch("/api/club");
            if (!r.ok) throw Error("No se pudo leer el club.");
            const d: ClubData = await r.json();
            await refresh();
            return {
              socios: d.members.length,
              planes: d.plans.length,
              reservas: d.bookings.filter((b) => b.status === "confirmed")
                .length,
            };
          },
        },
        { signal: controller.signal },
      );
    } catch {}
    return () => controller.abort();
  }, [refresh]);
  const today = data?.today ?? localDay(),
    valid =
      data?.members.filter(
        (m) => m.status === "active" && m.expires >= today,
      ) ?? [],
    expired = data?.members.filter((m) => m.expires < today) ?? [],
    due =
      data?.members.filter(
        (m) =>
          m.status === "active" &&
          m.expires >= today &&
          m.expires <= addDays(today, 7),
      ) ?? [],
    members =
      data?.members.filter((m) =>
        [m.name, m.dni, m.plan_name]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) ?? [];
  return (
    <main className="workspace">
      <WorkspaceHeader
        active="gestion"
        title="Todo listo para un nuevo día."
        subtitle="Registrá socios, controlá las cuotas y organizá las actividades del club."
      />
      <ErrorNotice error={modal ? "" : error} />
      {!data && error && (
        <Link className="button small" href="/equipo">
          Ver mi rol y acceso
        </Link>
      )}
      {success && (
        <div className="success-box" role="status">
          {success}
        </div>
      )}
      {!data ? (
        loading ? (
          <Loading />
        ) : (
          <button className="button" onClick={() => void refresh()}>
            Volver a intentar
          </button>
        )
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span>SOCIOS VIGENTES</span>
              <strong>{valid.length}</strong>
              <small>{data.members.length} socios registrados</small>
            </div>
            <div className="stat">
              <span>VENCEN EN 7 DÍAS</span>
              <strong>{due.length}</strong>
              <small>Para anticiparse</small>
            </div>
            <div className="stat">
              <span>COBRADO ESTE MES</span>
              <strong className="money">
                {money(
                  data.payments
                    .filter(
                      (p) =>
                        localDay(new Date(p.created_at)).slice(0, 7) ===
                        today.slice(0, 7),
                    )
                    .reduce((a, p) => a + p.amount, 0),
                )}
              </strong>
              <small>Sobre los últimos 500 cobros</small>
            </div>
            <div className="stat">
              <span>INGRESOS HOY</span>
              <strong>
                {
                  data.accesses.filter(
                    (a) =>
                      a.allowed && localDay(new Date(a.created_at)) === today,
                  ).length
                }
              </strong>
              <small>Últimos 100 eventos</small>
            </div>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Secciones del gimnasio">
              {[
                ["resumen", "Resumen"],
                ["socios", "Socios"],
                ["cobros", "Cobros"],
                ["clases", "Clases"],
                ["planes", "Planes"],
                ["actividad", "Actividad"],
              ].map(([v, l]) => (
                <TabsTrigger key={v} value={v}>
                  {l}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="resumen">
              {!data.plans.length && (
                <div className="panel empty">
                  <h3>Prepará tu primera demostración</h3>
                  <p>
                    Cargá socios ficticios, planes de ejemplo y una reserva para
                    recorrer el sistema.
                  </p>
                  <button
                    disabled={busy}
                    className="button gold"
                    onClick={() =>
                      void mutate({ action: "seed" }).catch(() => {})
                    }
                  >
                    {busy ? "Preparando…" : "Cargar ejemplos"}
                  </button>
                </div>
              )}
              <div className="dashboard-grid">
                <div className="panel">
                  <h2>El día a día</h2>
                  <div className="quick-actions">
                  <button
                    className="quick-action"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => open("member")}
                  >
                    <div>
                      <h3>Sumar un socio</h3>
                      <p>Datos, plan y vencimiento.</p>
                    </div>
                    <Users size={22} />
                  </button>
                  <button
                    className="quick-action"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => open("payment")}
                  >
                    <div>
                      <h3>Registrar un cobro</h3>
                      <p>La cuota se renueva automáticamente.</p>
                    </div>
                    <CreditCard size={22} />
                  </button>
                  {data.role === "owner" && (
                    <Link href="/reportes" className="quick-action">
                      <div>
                        <h3>Informes de administración</h3>
                        <p>
                          Cobros por período, vencimientos y saldos de pádel.
                        </p>
                      </div>
                      <BarChart3 size={22} />
                    </Link>
                  )}
                  {data.role === "owner" && (
                    <Link href="/configuracion" className="quick-action">
                      <div>
                        <h3>Configuración del club</h3>
                        <p>Reglas de pádel, cuenta y terminal de ingreso.</p>
                      </div>
                      <Settings size={22} />
                    </Link>
                  )}
                  <Link href="/ingreso" className="quick-action" target="_blank" rel="noopener noreferrer">
                    <div>
                      <h3>Abrir terminal de ingreso</h3>
                      <p>Validación por DNI en otra pestaña, con tu sesión.</p>
                    </div>
                    <ScanLine size={22} />
                  </Link>
                  <Link href="/reservas" className="quick-action">
                    <div>
                      <h3>Ver la agenda de pádel</h3>
                      <p>Cuatro canchas y turnos fijos.</p>
                    </div>
                    <CalendarDays size={22} />
                  </Link>
                  <Link href="/equipo" className="quick-action">
                    <div>
                      <h3>Equipo y permisos</h3>
                      <p>Cuentas y permisos del personal.</p>
                    </div>
                    <ShieldCheck size={22} />
                  </Link>
                  {data.role === "owner" && (
                    <Link href="/datos" className="quick-action">
                      <div>
                        <h3>Importación y respaldos</h3>
                        <p>Importá socios y guardá copias de los datos.</p>
                      </div>
                      <Database size={22} />
                    </Link>
                  )}
                  </div>
                </div>
                <div className="panel">
                  <h2>Vencimientos para revisar</h2>
                  {[...expired, ...due].slice(0, 8).map((m) => (
                    <div className="list-row" key={m.id}>
                      <div>
                        <strong>{m.name}</strong>
                        <br />
                        <small>
                          {m.plan_name} · {dateLabel(m.expires)}
                        </small>
                      </div>
                      <button
                        className="button small"
                        onClick={() => open("payment", m)}
                      >
                        Cobrar
                      </button>
                    </div>
                  ))}
                  {!expired.length && !due.length && (
                    <div className="empty">
                      No hay vencimientos pendientes esta semana.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="socios">
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    Socios{" "}
                    <span className="muted">/ {data.members.length}</span>
                  </h2>
                  <div>
                    {data.role === "owner" && (
                      <button
                        className="button small"
                        onClick={() => downloadCsv(data)}
                      >
                        <Download size={16} /> Exportar
                      </button>
                    )}
                    <button
                      className="button gold small"
                      onClick={() => open("member")}
                    >
                      <Plus size={17} /> Nuevo socio
                    </button>
                  </div>
                </div>
                <div className="toolbar">
                  <Search size={19} className="search-icon" />
                  <input
                    aria-label="Buscar socios"
                    placeholder="Nombre, DNI o plan…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    className="icon-button"
                    aria-label="Actualizar socios"
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <Table className="data-table">
                  <TableHeader>
                    <TableRow>
                      {[
                        "Socio",
                        "Plan",
                        "Vencimiento",
                        "Estado",
                        "Acciones",
                      ].map((x) => (
                        <TableHead key={x}>{x}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <strong>{m.name}</strong>
                          <br />
                          <span className="muted">DNI {m.dni}</span>
                        </TableCell>
                        <TableCell>{m.plan_name}</TableCell>
                        <TableCell>{dateLabel(m.expires)}</TableCell>
                        <TableCell>
                          <span
                            className={
                              "status " +
                              (m.status === "paused"
                                ? "warn"
                                : m.expires < today
                                  ? "bad"
                                  : "")
                            }
                          >
                            {m.status === "paused"
                              ? "Pausado"
                              : m.expires < today
                                ? "Vencido"
                                : "Vigente"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="row-actions">
                            <button
                              title="Editar socio"
                              aria-label={`Editar a ${m.name}`}
                              className="icon-button"
                              onClick={() => open("member", m)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              title="Registrar cobro"
                              aria-label={`Cobrar a ${m.name}`}
                              className="icon-button"
                              onClick={() => open("payment", m)}
                            >
                              <CreditCard size={16} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!members.length && (
                  <div className="empty">
                    {search
                      ? "No encontramos socios con esa búsqueda."
                      : "Todavía no hay socios registrados."}
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="cobros">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Cobros registrados</h2>
                  </div>
                  <button
                    className="button gold small"
                    onClick={() => open("payment")}
                  >
                    <Plus size={17} /> Registrar cobro
                  </button>
                </div>
                <p className="muted" style={{ marginBottom: 20 }}>
                  Registro administrativo. No procesa pagos ni emite facturas
                  fiscales. Se muestran los últimos 500 cobros.
                </p>
                <Table className="data-table">
                  <TableHeader>
                    <TableRow>
                      {["Socio", "Importe", "Medio", "Fecha"].map((x) => (
                        <TableHead key={x}>{x}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{money(p.amount)}</TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell>
                          {new Date(p.created_at).toLocaleString("es-AR", {
                            timeZone: "America/Argentina/Buenos_Aires",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!data.payments.length && (
                  <div className="empty">
                    Los cobros que registres aparecerán acá.
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="clases">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Clases y cupos</h2>
                  <button
                    className="button gold small"
                    onClick={() => open("session")}
                  >
                    <Plus size={17} /> Nueva clase
                  </button>
                </div>
                {data.sessions.map((s) => (
                  <div key={s.id} className="panel">
                    <div className="panel-heading">
                      <div>
                        <h3>{s.name}</h3>
                        <span className="status">
                          {s.enrolled}/{s.capacity} lugares
                        </span>
                      </div>
                      <button
                        className="button small"
                        disabled={s.enrolled >= s.capacity || s.day < today}
                        onClick={() => {
                          setSession(s);
                          open("enroll");
                        }}
                      >
                        Inscribir socio
                      </button>
                    </div>
                    <p className="muted">
                      {dateLabel(s.day)} · {s.time} · {s.venue}
                    </p>
                    {data.enrollments
                      .filter((e) => e.session_id === s.id)
                      .map((e) => (
                        <div className="list-row" key={e.id}>
                          <span>{e.name}</span>
                          <button
                            disabled={busy}
                            className="text-link"
                            onClick={() =>
                              void mutate({
                                action: "cancelEnrollment",
                                id: e.id,
                              }).catch(() => {})
                            }
                          >
                            Quitar inscripción
                          </button>
                        </div>
                      ))}
                  </div>
                ))}
                {!data.sessions.length && (
                  <div className="empty">
                    Creá una clase con fecha, sede y cupo.
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="planes">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Planes del gimnasio</h2>
                  <button
                    disabled={data.role !== "owner"}
                    className="button gold small"
                    onClick={() => open("plan")}
                  >
                    <Plus size={17} /> Crear plan
                  </button>
                </div>
                <p className="muted">
                  Los importes de ejemplo no son las tarifas de Gold Gym. Cada
                  cobro extiende el vencimiento la cantidad de días del plan.
                </p>
                {data.plans.map((p) => (
                  <div className="list-row" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <br />
                      <small>{p.days} días de vigencia por cobro</small>
                    </div>
                    <div>
                      <strong>{money(p.price)}</strong>{" "}
                      <button
                        disabled={data.role !== "owner"}
                        className="button small"
                        aria-label={`Actualizar precio de ${p.name}`}
                        onClick={() => {
                          setPricePlan(p);
                          open("price");
                        }}
                      >
                        Actualizar precio
                      </button>
                    </div>
                  </div>
                ))}
                {!data.plans.length && (
                  <div className="empty">
                    Creá el primer plan para registrar socios.
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="actividad">
              <div className="dashboard-grid">
                <section className="panel">
                  <h2>Últimos ingresos</h2>
                  {data.accesses.map((a) => (
                    <div className="list-row" key={a.id}>
                      <div>
                        <strong>{a.name}</strong>
                        <br />
                        <small>
                          {a.venue} ·{" "}
                          {new Date(a.created_at).toLocaleString("es-AR", {
                            timeZone: "America/Argentina/Buenos_Aires",
                          })}
                        </small>
                      </div>
                      <span className={"status " + (a.allowed ? "" : "bad")}>
                        {a.reason}
                      </span>
                    </div>
                  ))}
                  {!data.accesses.length && (
                    <div className="empty">
                      Probá la terminal para registrar el primer ingreso.
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Registro de cambios</h2>
                    {data.role === "owner" && (
                      <a className="button small" href="/api/export" download>
                        Descargar todos los datos
                      </a>
                    )}
                  </div>
                  {data.audit.map((a) => (
                    <div className="list-row" key={a.id}>
                      <div>
                        <strong>{a.action}</strong>
                        <p className="muted">{a.detail}</p>
                        <small>
                          {new Date(a.created_at).toLocaleString("es-AR", {
                            timeZone: "America/Argentina/Buenos_Aires",
                          })}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!data.audit.length && (
                    <div className="empty">
                      Todavía no hay cambios registrados.
                    </div>
                  )}
                </section>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      <FormModal
        open={modal !== null}
        onClose={() => {
          if (!busy) setModal(null);
        }}
        title={
          {
            member: selected ? "Editar socio" : "Nuevo socio",
            payment: "Registrar cobro",
            plan: "Crear plan",
            price: "Actualizar precio",
            session: "Nueva clase",
            enroll: "Inscribir a una clase",
          }[modal ?? "member"]
        }
        description={
          modal === "payment"
            ? "Confirmá el medio de pago. El vencimiento se extiende desde hoy o desde el vencimiento vigente, lo que sea posterior."
            : "Completá los datos. Los cambios se guardan en el espacio de presentación."
        }
      >
        <ErrorNotice error={error} />
        {data && modal === "member" && (
          <MemberForm
            member={selected}
            data={data}
            busy={busy}
            submit={submit}
          />
        )}{" "}
        {data && modal === "payment" && (
          <PaymentForm
            member={selected}
            data={data}
            busy={busy}
            submit={submit}
          />
        )}{" "}
        {modal === "price" && pricePlan && (
          <PriceForm plan={pricePlan} busy={busy} submit={submit} />
        )}{" "}
        {modal === "plan" && <PlanForm busy={busy} submit={submit} />}{" "}
        {modal === "session" && <SessionForm busy={busy} submit={submit} />}{" "}
        {modal === "enroll" && data && session && (
          <EnrollmentForm
            session={session}
            data={data}
            busy={busy}
            submit={submit}
          />
        )}
      </FormModal>
    </main>
  );
}
function MemberForm({
  member,
  data,
  busy,
  submit,
}: {
  member: Member | null;
  data: ClubData;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(member?.name ?? ""),
    [dni, setDni] = useState(member?.dni ?? ""),
    [phone, setPhone] = useState(member?.phone ?? ""),
    [planId, setPlan] = useState(member?.plan_id ?? data.plans[0]?.id ?? ""),
    [expires, setExpires] = useState(member?.expires ?? data.today),
    [status, setStatus] = useState(member?.status ?? "active");
  return !data.plans.length ? (
    <p>
      Primero creá un plan en la sección Planes. Los socios se registran aquí
      con su DNI; no necesitan cuenta, correo ni contraseña.
    </p>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "member",
          id: member?.id,
          original: member ?? undefined,
          name,
          dni,
          phone,
          planId,
          expires,
          status,
        });
      }}
    >
      <p className="muted" style={{ marginBottom: 20 }}>
        Alta administrativa del socio. No se crea una cuenta de acceso ni se
        envían correos al cliente.
      </p>
      <div className="form-grid">
        <Field label="Nombre y apellido" full>
          <input
            required
            maxLength={80}
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="DNI">
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{7,8}"
            maxLength={8}
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Teléfono (opcional)">
          <input
            type="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Plan">
          <SelectField value={planId} onChange={setPlan}>
            {data.plans.map((p) => (
              <Option key={p.id} value={p.id}>
                {p.name}
              </Option>
            ))}
          </SelectField>
        </Field>
        <Field label="Vigente hasta">
          <input
            type="date"
            required
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
        <Field label="Estado">
          <SelectField value={status} onChange={setStatus}>
            <Option value="active">Activo</Option>
            <Option value="paused">Pausado</Option>
          </SelectField>
        </Field>
      </div>
      <div className="form-actions">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}
function PaymentForm({
  member,
  data,
  busy,
  submit,
}: {
  member: Member | null;
  data: ClubData;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [memberId, setMember] = useState(member?.id ?? ""),
    [method, setMethod] = useState("Efectivo"),
    [venue, setVenue] = useState(""),
    [requestKey] = useState(() => requestId());
  const m = data.members.find((m) => m.id === memberId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "payment",
          venue,
          memberId,
          method,
          expectedPrice: m?.price,
          requestKey,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Socio" full>
          <SelectField value={memberId} onChange={setMember} required>
            <Option value="">Elegí un socio</Option>
            {data.members.map((m) => (
              <Option key={m.id} value={m.id}>
                {m.name} · {m.dni}
              </Option>
            ))}
          </SelectField>
        </Field>
        <Field label="Sede donde se cobra" full>
          <SelectField value={venue} onChange={setVenue} required>
            <Option value="">Elegí una sede</Option>
            {branches.map((b) => (
              <Option key={b.id} value={b.id}>
                {b.name}
              </Option>
            ))}
          </SelectField>
        </Field>
        <Field label="Medio de pago" full>
          <SelectField value={method} onChange={setMethod}>
            {["Efectivo", "Transferencia", "Tarjeta"].map((x) => (
              <Option key={x}>{x}</Option>
            ))}
          </SelectField>
        </Field>
      </div>
      {m && (
        <div className="notice" style={{ marginTop: 20 }}>
          <strong>{money(m.price)}</strong> · {m.plan_name}
          <br />
          Nuevo vencimiento:{" "}
          {dateLabel(
            addDays(
              m.expires > data.today ? m.expires : data.today,
              data.plans.find((p) => p.id === m.plan_id)?.days ?? 30,
            ),
          )}
          {m.status === "paused" && (
            <p>
              El socio seguirá pausado. Activá su membresía desde Editar socio
              cuando corresponda.
            </p>
          )}
        </div>
      )}
      <div className="form-actions">
        <SaveButton busy={busy}>Confirmar cobro</SaveButton>
      </div>
    </form>
  );
}
function PlanForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [days, setDays] = useState("30");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "plan",
          name,
          price: Number(price),
          days: Number(days),
        });
      }}
    >
      <div className="form-grid">
        <Field label="Nombre del plan" full>
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Precio por período (ARS)">
          <input
            type="number"
            min="0"
            max="10000000"
            step="1"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Días de vigencia">
          <input
            type="number"
            min="1"
            max="366"
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-actions">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}
function SessionForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(""),
    [day, setDay] = useState(localDay()),
    [time, setTime] = useState("18:00"),
    [capacity, setCapacity] = useState("8"),
    [venue, setVenue] = useState("Calle 30");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "session",
          name,
          day,
          time,
          capacity: Number(capacity),
          venue,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Actividad" full>
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Fecha">
          <input
            type="date"
            required
            min={localDay()}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <Field label="Hora">
          <input
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Lugares">
          <input
            type="number"
            min="1"
            max="100"
            required
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
        <Field label="Sede">
          <SelectField value={venue} onChange={setVenue}>
            {["Calle 30", "Calle 23", "Club Unión", "Pilates"].map((x) => (
              <Option key={x}>{x}</Option>
            ))}
          </SelectField>
        </Field>
      </div>
      <div className="form-actions">
        <SaveButton busy={busy} />
      </div>
    </form>
  );
}
function EnrollmentForm({
  session,
  data,
  busy,
  submit,
}: {
  session: Session;
  data: ClubData;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [id, setId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ action: "enroll", sessionId: session.id, memberId: id });
      }}
    >
      <p className="muted" style={{ marginBottom: 15 }}>
        {session.name} · {dateLabel(session.day)} · {session.time}
      </p>
      <Field label="Socio">
        <SelectField value={id} onChange={setId} required>
          <Option value="">Elegí un socio</Option>
          {data.members
            .filter(
              (m) =>
                !data.enrollments.some(
                  (e) => e.session_id === session.id && e.member_id === m.id,
                ),
            )
            .map((m) => (
              <Option key={m.id} value={m.id}>
                {m.name}
              </Option>
            ))}
        </SelectField>
      </Field>
      <div className="form-actions">
        <SaveButton busy={busy}>Confirmar inscripción</SaveButton>
      </div>
    </form>
  );
}

function PriceForm({
  plan,
  busy,
  submit,
}: {
  plan: Plan;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [price, setPrice] = useState(String(plan.price));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "planPrice",
          id: plan.id,
          price: Number(price),
          expectedPrice: plan.price,
        });
      }}
    >
      <p className="muted" style={{ marginBottom: 20 }}>
        {plan.name} · Precio actual: {money(plan.price)}. El nuevo precio se
        aplica a los próximos cobros de los socios de este plan. Los pagos
        anteriores y las fechas de vencimiento se conservan.
      </p>
      <Field label="Nuevo precio (ARS)">
        <input
          type="number"
          required
          min="0"
          max="10000000"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <div className="form-actions">
        <SaveButton busy={busy}>Confirmar nuevo precio</SaveButton>
      </div>
    </form>
  );
}
