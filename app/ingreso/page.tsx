"use client";
import { apiFetch } from "@/lib/api-fetch";
import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, ScanLine, CheckCircle2, TriangleAlert } from "lucide-react";
import {
  Field,
  ErrorNotice,
} from "@/components/club-client";
export default function Kiosk() {
  const [dni, setDni] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      allowed: boolean;
      reason: string;
      name: string | null;
    } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await apiFetch("/api/club", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "access", dni }),
        }),
        j = (await r.json()) as {
          error?: string;
          allowed: boolean;
          reason: string;
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
        <Link href="/gestion" className="text-link">
          <ArrowLeft size={16} /> Volver a gestión
        </Link>
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
          <button className="button gold" type="submit" disabled={busy} aria-busy={busy}>
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
            <p className="muted" style={{ marginTop: 18 }}>
              Validación registrada. Esta terminal no acciona un molinete
              físico.
            </p>
          </div>
        )}
        <div className="kiosk-hints">
          <strong>Prueba con datos ficticios</strong>
          <p>
            Después de cargar los ejemplos: 99000001 vigente · 99000002 vencido
            · 99000003 pausado.
          </p>
        </div>
      </section>
    </main>
  );
}
