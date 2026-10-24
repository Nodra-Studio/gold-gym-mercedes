"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { scopeLabel, type StaffScope } from "@/lib/staff-scope";
import {
  Field,
  SelectField,
  Option,
  ErrorNotice,
  SaveButton,
  FormModal,
} from "@/components/club-client";
type Staff = StaffScope & {
  user_id: string;
  name: string;
  role: "owner" | "reception" | "gate" | "player";
  status: "active" | "revoked";
  reason?: string;
};
type Team = Partial<StaffScope> & {
  authProvider?: "sites" | "supabase";
  userId: string;
  role: "owner" | "reception" | "gate" | "player" | "revoked" | "pending";
  members: Staff[];
};
export default function TeamClient() {
  const [data, setData] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Staff | null>(null),
    [open, setOpen] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const r = await apiFetch("/api/team", { cache: "no-store" }),
        j = (await r.json()) as Team & { error?: string };
      if (!r.ok) throw Error(j.error);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el equipo.");
    }
  }
  // Load remote identity and permissions once on mount.
  useEffect(() => {
    // Loading belongs to this remote request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  async function save(input: Staff) {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: input.user_id,
            name: input.name,
            role: input.role,
            status: input.status,
            activity_scope: input.activity_scope,
            branch_scope: input.branch_scope,
            reason: input.reason,
          }),
        }),
        j = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(j.error);
      await load();
      setOpen(false);
      setNotice(
        "Acceso actualizado. El permiso se verifica en cada nueva solicitud.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <Link href="/gestion" className="text-link">
        ← Volver a gestión
      </Link>
      <header className="work-header">
        <div>
          <h1>Equipo y permisos</h1>
          <p>Administrá las cuentas del personal y sus permisos por actividad y sede.</p>
        </div>
      </header>
      {!open && <ErrorNotice error={error} />}{" "}
      {notice && (
        <p className="success-box" role="status">
          {notice}
        </p>
      )}
      <details className="panel team-account">
        <summary>Mi cuenta y permisos</summary>
        {data?.authProvider === "supabase" && <Link href="/cuenta" className="text-link">Mi cuenta y cierre de sesión</Link>}
        <p style={{ marginTop: 18 }}>
          Identificador de esta cuenta en el sitio:
        </p>
        <code
          style={{
            display: "block",
            overflowWrap: "anywhere",
            padding: "14px 0",
            color: "var(--gold)",
          }}
        >
          {data?.userId ?? "Cargando…"}
        </code>
        <p className="muted">
          Si vas a trabajar como personal, compartí este identificador con la
          administración. No es una contraseña. Cada persona debe ingresar con
          su propia cuenta.
        </p>
        <p style={{ marginTop: 16 }}>
          Rol:{" "}
          <strong>
            {data
              ? {
                  owner: "Dueño / administración",
                  reception: "Recepción",
                  gate: "Terminal de ingreso",
                  player: "Jugador de pádel",
                  revoked: "Acceso desactivado",
                  pending: "Pendiente de habilitación",
                }[data.role]
              : "Cargando…"}
          </strong>
        </p>
        {data?.role === "reception" && <p className="muted" style={{ marginTop: 12 }}>Alcance: {scopeLabel(data)}</p>}
        {data?.role === "player" && (
          <Link href="/jugar" className="button gold" style={{ marginTop: 20 }}>
            Abrir mis reservas
          </Link>
        )}
        {data?.role === "gate" && (
          <Link
            href="/ingreso"
            className="button gold"
            style={{ marginTop: 20 }}
          >
            Abrir terminal de ingreso
          </Link>
        )}
      </details>
      {data?.role === "owner" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Accesos del club</h2>
              <button
                className="button gold small"
                onClick={() => {
                  setSelected(null);
                  setError("");
                  setOpen(true);
                }}
              >
                Agregar persona
              </button>
            </div>
            <p className="muted">
              Creá una cuenta del personal en /crear-cuenta, confirmá su correo y copiá el identificador de /cuenta.
              Agregala aquí con el rol correspondiente. Los dueños comparten toda la gestión del club y pueden consultar los informes por sede.
              Los socios se cargan en Gimnasio, sin cuenta.
              Una cuenta de recepción puede abrirse en varias computadoras a la vez.
              Para el molinete, abrí Terminal de ingreso con tu sesión actual: no necesita otro correo ni otra cuenta.
            </p>
            {data.members.map((m) => (
              <div className="list-row" key={m.user_id}>
                <div>
                  <strong>{m.name}</strong>
                  <p className="muted">
                    {{ owner: "Dueño / administración", reception: "Recepción", player: "Jugador de pádel", gate: "Terminal de ingreso" }[m.role]}{" "}
                    · {m.status === "active" ? "Activo" : "Desactivado"}
                    {m.role === "reception" && <> · {scopeLabel(m)}</>}
                  </p>
                </div>
                <button
                  className="button small"
                  disabled={m.user_id === data.userId}
                  onClick={() => {
                    setSelected(m);
                    setError("");
                    setOpen(true);
                  }}
                >
                  {m.user_id === data.userId ? "Tu acceso" : `Editar acceso de ${m.name}`}
                </button>
              </div>
            ))}
            {!data.members.length && (
              <p className="empty">Todavía no agregaste otras cuentas.</p>
            )}
          </section>
          <section className="panel">
            <h2>Qué puede hacer cada rol</h2>
            <div className="list-row">
              <strong>Dueño / administración</strong>
              <p>
                Gestión completa, precios, equipo, importación y exportación.
                Cada dueño usa su propia cuenta y comparte los mismos datos de todas las sedes.
                Los informes conservan el filtro por sede.
              </p>
            </div>
            <div className="list-row">
              <strong>Recepción</strong>
              <p>
                Socios, cuotas, clases, reservas y caja diaria dentro de su alcance.
                Con acceso general puede crear planes y actualizar sus precios y publicación. Los permisos,
                respaldos y ajustes financieros sensibles quedan para los dueños.
                El dueño define si trabaja en todas las actividades, sólo gimnasio,
                pádel o Pilates. Para gimnasio también puede limitarla a una sede.
                Los socios de gimnasio se comparten entre las tres sedes; los cobros, la caja y las terminales respetan las sedes asignadas.
              </p>
            </div>
            <div className="list-row">
              <strong>Terminal</strong>
              <p>
                Validar un DNI y registrar el resultado. Sin consultar listados
                del club. Rol opcional para cuentas existentes dedicadas al molinete. Administración y recepción también pueden abrir la terminal con su propia sesión.
              </p>
            </div>
          </section>
        </>
      )}
      <FormModal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={selected ? "Editar acceso" : "Agregar persona"}
        description="Usá el identificador que la persona encuentra en Mi cuenta al ingresar con su propia cuenta."
      >
        <ErrorNotice error={error} />
        {open && <StaffForm staff={selected} busy={busy} submit={save} />}
      </FormModal>
    </main>
  );
}
function StaffForm({
  staff,
  busy,
  submit,
}: {
  staff: Staff | null;
  busy: boolean;
  submit: (s: Staff) => void;
}) {
  const [id, setId] = useState(staff?.user_id ?? ""),
    [name, setName] = useState(staff?.name ?? ""),
    [role, setRole] = useState<Staff["role"]>(staff?.role ?? "reception"),
    [status, setStatus] = useState<Staff["status"]>(staff?.status ?? "active"),
    [activity, setActivity] = useState<StaffScope["activity_scope"]>(staff?.activity_scope ?? "all"),
    [branch, setBranch] = useState<StaffScope["branch_scope"]>(staff?.branch_scope ?? "all"),
    [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ user_id: id, name, role, status,
          activity_scope: role === "reception" ? activity : "all",
          branch_scope: role === "reception" && ["all", "gym"].includes(activity) ? branch : "all",
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      }}
    >
      <div className="form-grid">
        <Field label="Identificador de la cuenta" full>
          <input
            required
            maxLength={200}
            readOnly={!!staff}
            value={id}
            onChange={(e) => setId(e.target.value.trim())}
          />
        </Field>
        <Field label="Nombre para identificar a la persona" full>
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Rol">
          <SelectField
            value={role}
            onChange={(v) => setRole(v as Staff["role"])}
          >
            <Option value="owner">Dueño / administración</Option>
            <Option value="reception">Recepción</Option>
            <Option value="gate">Terminal de ingreso</Option>

          </SelectField>
        </Field>
        <Field label="Estado">
          <SelectField
            value={status}
            onChange={(v) => setStatus(v as Staff["status"])}
          >
            <Option value="active">Activo</Option>
            <Option value="revoked">Desactivado</Option>
          </SelectField>
        </Field>
        {role === "reception" && <>
          <Field label="Actividad habilitada" full>
            <SelectField value={activity} onChange={(value) => setActivity(value as StaffScope["activity_scope"])}>
              <Option value="all">Todas las actividades</Option>
              <Option value="gym">Sólo gimnasio</Option>
              <Option value="padel">Sólo pádel · Club Unión</Option>
              <Option value="pilates">Sólo Pilates</Option>
            </SelectField>
          </Field>
          {["all", "gym"].includes(activity) && <Field label="Sedes de gimnasio habilitadas" full>
            <SelectField value={branch} onChange={(value) => setBranch(value as StaffScope["branch_scope"])}>
              <Option value="all">Todos los gimnasios</Option>
              <Option value="calle30">Sólo Calle 30</Option>
              <Option value="calle23">Sólo Calle 23</Option>
              <Option value="velez">Sólo Club Unión</Option>
            </SelectField>
          </Field>}
          <p className="muted">{scopeLabel({ activity_scope: activity, branch_scope: ["all", "gym"].includes(activity) ? branch : "all" })}.</p>
        </>}
        <Field label="Motivo o nota del cambio (opcional)" full>
          <textarea value={reason} minLength={3} maxLength={300} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        {role === "owner" && "El rol de dueño otorga gestión completa y permite habilitar otras cuentas. "}
        Revisá el identificador y el rol antes de confirmar. Desactivar corta el
        acceso de esa cuenta al club. No podés modificar tu propio acceso.
      </p>
      <div className="form-actions">
        <SaveButton busy={busy}>Confirmar acceso</SaveButton>
      </div>
    </form>
  );
}

