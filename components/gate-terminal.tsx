"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useState, useRef, useEffect } from "react";
import { ScanLine, CheckCircle2, TriangleAlert } from "lucide-react";
import {
  Field,
  ErrorNotice,
  SelectField,
} from "@/components/club-client";
export default function Kiosk() {
  const [venue, setVenue] = useState('');
  useEffect(() => {
    // Restore the terminal setting after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const saved = localStorage.getItem('gold-terminal-venue') ?? '';
    setVenue(['Unión Gold Club','Club Vélez'].includes(saved) ? 'Club Unión' : saved);
  }, []);

  const [dni, setDni] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      allowed: boolean;
      reason: string;
      warning?: string | null;
      name: string | null;
    } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!result && !error) return;
    const timer = setTimeout(() => { setResult(null); setError(''); ref.current?.focus(); }, 10000);
    return () => clearTimeout(timer);
  }, [result, error]);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !venue) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await apiFetch("/api/club", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "access", dni, venue }),
        }),
        j = (await r.json()) as {
          error?: string;
          allowed: boolean;
          reason: string;
      warning?: string | null;
          name: string | null;
        };
      if (!r.ok) throw Error(j.error);
      setResult(j);
      setDni("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo verificar la membresía.",
      );
    } finally {
      setBusy(false);
      ref.current?.focus();
    }
  }
  return (
    <main className="kiosk">
      <header className="kiosk-header">
        <span className="eyebrow">GOLD GYM / INGRESO</span>
        <span className="status warn">Molinete simulado</span>
      </header>
      <section className="kiosk-body">
        <img
          src="/images/logo.webp"
          alt="Gold Gym"
          width="95"
          height="95"
          style={{ margin: "auto", borderRadius: "50%" }}
        />
        <h1>
          Bienvenido a <em>Gold.</em>
        </h1>
        <p>Un solo club. Todas las sedes. Ingresá tu DNI.</p>
        <Field label="Sede de esta terminal">
          <SelectField value={venue} required onChange={(v) => { setVenue(v); localStorage.setItem('gold-terminal-venue', v); }}>
            <option value="">Seleccioná la sede</option>
            {['Calle 30', 'Calle 23', 'Club Unión', 'Pilates'].map(v => <option key={v} value={v}>{v}</option>)}
          </SelectField>
        </Field>
        <form onSubmit={check} style={{ marginTop: 30 }}>
          <div style={{ marginTop: 20 }}>
            <Field label="Número de DNI">
              <input
                ref={ref}
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{7,8}"
                maxLength={8}
                required
                autoComplete="off"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                placeholder="Tu DNI"
              />
            </Field>
          </div>
          <button className="button gold" type="submit" disabled={busy || !venue} aria-busy={busy}>
            <ScanLine size={22} />
            {busy ? "Verificando…" : "Validar ingreso"}
          </button>
        </form>
        <ErrorNotice error={error} />
        {result && (
          <div
            className={"kiosk-result " + (result.allowed ? "ok" : "no")}
            role="status"
          >
            {result.allowed ? (
              <CheckCircle2 size={42} style={{ margin: "0 auto 16px" }} />
            ) : (
              <TriangleAlert size={42} style={{ margin: "0 auto 16px" }} />
            )}
            <h2>{result.allowed ? "Podés ingresar" : "Pasá por recepción"}</h2>
            <p>
              {result.name && (
                <strong>
                  {result.name}
                  <br />
                </strong>
              )}
              {result.reason}
            </p>
            {result.warning && <p className="notice" style={{marginTop: 18}}>{result.warning}</p>}
            <p className="muted" style={{ marginTop: 18 }}>
              Validación registrada. Esta terminal no acciona un molinete
              físico.
            </p>
          </div>
        )}
        <p className="muted">No necesitás cuenta ni contraseña. Si tu DNI no está registrado, acercate a recepción. El resultado se borra después de 10 segundos.</p>
      </section>
    </main>
  );
}

