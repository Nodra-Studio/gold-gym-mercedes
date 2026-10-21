"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Field,
  SelectField,
  Option,
  ErrorNotice,
  SaveButton,
  FormModal,
} from "@/components/club-client";
type Staff = {
  user_id: string;
  name: string;
  role: "owner" | "reception" | "gate" | "player";
  status: "active" | "revoked";
};
type Team = {
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
          <p className="eyebrow">GOLD GYM / EQUIPO</p>
          <h1>Dueños y equipo.</h1>
          <p>Permisos para trabajar sobre el mismo club.</p>
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
                Socios, cuotas, clases, reservas y caja diaria. Puede crear
                planes y actualizar sus precios y publicación. Los permisos,
                respaldos y ajustes financieros sensibles quedan para los dueños.
                Su cuenta puede usarse en varias recepciones a la vez y comparte
                la información del club.
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
    [status, setStatus] = useState<Staff["status"]>(staff?.status ?? "active");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ user_id: id, name, role, status });
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

