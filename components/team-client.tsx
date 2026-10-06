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
  role: "reception" | "gate" | "player";
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
          <h1>Accesos del personal.</h1>
          <p>Permisos para trabajar sobre el mismo club.</p>
        </div>
      </header>
      {!open && <ErrorNotice error={error} />}{" "}
      {notice && (
        <p className="success-box" role="status">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2>Tu cuenta</h2>
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
                  owner: "Administración",
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
      </section>
      {data?.role === "owner" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Personal del club</h2>
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
              Agregala aquí como Recepción o Terminal. Los socios se cargan en Gimnasio, sin cuenta.
              Una cuenta de recepción puede abrirse en varias computadoras a la vez.
              Para el molinete usá una cuenta distinta con rol Terminal, sin acceso a la gestión.
            </p>
            {data.members.map((m) => (
              <div className="list-row" key={m.user_id}>
                <div>
                  <strong>{m.name}</strong>
                  <p className="muted">
                    {m.role === "reception"
                      ? "Recepción"
                      : m.role === "player"
                        ? "Jugador de pádel"
                        : "Terminal de ingreso"}{" "}
                    · {m.status === "active" ? "Activo" : "Desactivado"}
                  </p>
                </div>
                <button
                  className="button small"
                  onClick={() => {
                    setSelected(m);
                    setError("");
                    setOpen(true);
                  }}
                >
                  Editar acceso de {m.name}
                </button>
              </div>
            ))}
            {!data.members.length && (
              <p className="empty">Todavía no agregaste personal.</p>
            )}
          </section>
          <section className="panel">
            <h2>Qué puede hacer cada rol</h2>
            <div className="list-row">
              <strong>Administración</strong>
              <p>
                Gestión completa, precios, equipo, importación y exportación.
              </p>
            </div>
            <div className="list-row">
              <strong>Recepción</strong>
              <p>
                Socios, cuotas, clases, agenda e ingresos. Sin modificar
                precios, equipo o respaldos. La misma cuenta puede usarse en varias recepciones a la vez; los cambios se guardan en la misma base.
              </p>
            </div>
            <div className="list-row">
              <strong>Terminal</strong>
              <p>
                Validar un DNI y registrar el resultado. Sin consultar listados
                del club. Usá esta cuenta exclusiva en la pantalla del molinete; el cliente solo ingresa su DNI.
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
        description="Usá el identificador que la persona ve en esta misma página con su cuenta."
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
        Revisá el identificador y el rol antes de confirmar. Desactivar corta el
        acceso del personal al club.
      </p>
      <div className="form-actions">
        <SaveButton busy={busy}>Confirmar acceso</SaveButton>
      </div>
    </form>
  );
}

