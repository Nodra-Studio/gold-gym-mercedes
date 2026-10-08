"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Field,
  ErrorNotice,
  SaveButton,
  useClub,
} from "@/components/club-client";
export default function SettingsClient() {
  const { data, error: loadError } = useClub();
  const [price, setPrice] = useState(""),
    [days, setDays] = useState("30"),
    [hours, setHours] = useState("24"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    void apiFetch("/api/settings")
      .then(async (r) => {
        const j = (await r.json()) as {
          padel_price: number;
          booking_days: number;
          cancel_hours: number;
          error?: string;
        };
        if (!r.ok) throw Error(j.error);
        setPrice(String(j.padel_price));
        setDays(String(j.booking_days));
        setHours(String(j.cancel_hours));
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="workspace">
      <Link className="text-link" href="/gestion">
        ← Gestión
      </Link>
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / CONFIGURACIÓN</p>
          <h1>Configuración del club.</h1>
        </div>
      </header>
      <ErrorNotice error={error || loadError} />
      {notice && (
        <p className="success-box" role="status">
          {notice}
        </p>
      )}
      <section className="panel settings-access">
        <h2>Cuenta y pantallas</h2>
        <p className="muted">Consultá tu identificador y tus permisos, o prepará la pantalla de ingreso con tu sesión actual.</p>
        <div className="form-actions">
          <Link href="/cuenta" className="button">Mi cuenta e identificador</Link>
          <Link href="/ingreso" className="button gold" target="_blank" rel="noopener noreferrer">Abrir terminal de ingreso ↗</Link>
        </div>
      </section>
      {data?.role === "owner" && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await apiFetch("/api/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    padel_price: Number(price),
                    booking_days: Number(days),
                    cancel_hours: Number(hours),
                  }),
                }),
                j = (await r.json()) as { error?: string };
              if (!r.ok) throw Error(j.error);
              setNotice(
                "Reglas actualizadas. Los importes de reservas anteriores se conservan.",
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo guardar.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Portal de jugadores</h2>
          <p className="muted" style={{ margin: "18px 0" }}>
            Configuración de demostración. Confirmá estas reglas con el club
            antes de habilitar jugadores reales. Turnos de 90 minutos, cuatro
            canchas y pago manual.
          </p>
          <div className="form-grid">
            <Field label="Precio por turno (ARS)">
              <input
                type="number"
                required
                min="0"
                max="10000000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
            <Field label="Anticipación máxima (días)">
              <input
                type="number"
                required
                min="1"
                max="90"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
            <Field label="Anticipación para cancelar (horas)">
              <input
                type="number"
                required
                min="0"
                max="168"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
          </div>
          <p className="muted" style={{ marginTop: 20 }}>
            Las reservas con pagos registrados siempre requieren contactar al
            club para cancelar. La recepción puede cargar importes particulares
            desde la agenda administrativa.
          </p>
          <div className="form-actions">
            <SaveButton busy={busy}>Guardar reglas</SaveButton>
          </div>
        </form>
      )}
    </main>
  );
}
