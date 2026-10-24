"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { branches, branchIds, branchName } from "@/lib/branches";
import { fiscalConditions, fiscalConditionNames, fiscalSettingsSchema, type FiscalIssuer } from "@/lib/fiscal-settings";

type Draft = {
  legal_name: string;
  tax_id: string;
  fiscal_address: string;
  tax_condition: string;
  point_of_sale: string;
  expectedRevision: number;
};

function draftFor(setting?: FiscalIssuer): Draft {
  return {
    legal_name: setting?.legal_name ?? "",
    tax_id: setting?.tax_id ?? "",
    fiscal_address: setting?.fiscal_address ?? "",
    tax_condition: setting?.tax_condition ?? "",
    point_of_sale: setting ? String(setting.point_of_sale) : "",
    expectedRevision: setting?.revision ?? 0,
  };
}

export default function FiscalSettings({ initialSettings }: { initialSettings: FiscalIssuer[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [venue, setVenue] = useState<(typeof branchIds)[number]>(branchIds[0]);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(branchIds.map((id) => [id, draftFor(initialSettings.find((setting) => setting.venue === id))])) as Record<(typeof branchIds)[number], Draft>);
  const [busy, setBusy] = useState<"save" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const draft = drafts[venue];
  const saved = settings.find((setting) => setting.venue === venue);

  function change(field: keyof Omit<Draft, "expectedRevision">, value: string) {
    setDrafts((current) => ({ ...current, [venue]: { ...current[venue], [field]: value } }));
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    const parsed = fiscalSettingsSchema.safeParse({ ...draft, venue, point_of_sale: Number(draft.point_of_sale) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisá los datos fiscales.");
      return;
    }
    setBusy("save");
    try {
      const response = await apiFetch("/api/fiscal-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json() as { setting?: FiscalIssuer; error?: string };
      if (!response.ok || !result.setting) throw new Error(result.error ?? "No se pudieron guardar los datos.");
      const updated = result.setting;
      setSettings((current) => [...current.filter((setting) => setting.venue !== venue), updated]);
      setDrafts((current) => ({ ...current, [venue]: draftFor(updated) }));
      setNotice(`Datos fiscales de ${branchName(venue)} guardados.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudieron guardar los datos.");
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    if (busy) return;
    setBusy("reload");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/fiscal-settings");
      const result = await response.json() as { settings?: FiscalIssuer[]; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error ?? "No se pudieron cargar los datos.");
      const latest = result.settings;
      setSettings(latest);
      setDrafts((current) => ({ ...current, [venue]: draftFor(latest.find((setting) => setting.venue === venue)) }));
      setNotice(`Se cargó la versión guardada de ${branchName(venue)}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudieron cargar los datos.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="workspace">
      <Link className="text-link" href="/configuracion">← Configuración</Link>
      <header className="work-header">
        <div>
          <h1>Datos fiscales por sede</h1>
          <p>Estos datos preparan la facturación; todavía no se emiten comprobantes fiscales.</p>
        </div>
      </header>
      {error ? <p className="error-box" role="alert">{error}</p> : null}
      {notice ? <p className="success-box" role="status">{notice}</p> : null}
      <section className="panel" aria-labelledby="fiscal-summary">
        <h2 id="fiscal-summary">Datos registrados</h2>
        <ul>
          {branches.map((branch) => <li key={branch.id}>{branch.name}: {settings.some((setting) => setting.venue === branch.id) ? "datos cargados, emisión pendiente" : "faltan datos fiscales"}.</li>)}
        </ul>
        <p className="muted">Ingresá los datos del titular que corresponde a cada sede, según su constancia fiscal.</p>
      </section>
      <form className="panel" onSubmit={save} aria-busy={busy !== null}>
        <div className="form-grid">
          <label className="field full">
            <span>Sede</span>
            <select disabled={busy !== null} value={venue} onChange={(event) => { setVenue(event.target.value as (typeof branchIds)[number]); setError(""); setNotice(""); }}>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="field full">
            <span>Razón social o nombre del titular</span>
            <input required minLength={2} maxLength={200} disabled={busy !== null} value={draft.legal_name} onChange={(event) => change("legal_name", event.target.value)} autoComplete="organization" />
          </label>
          <label className="field">
            <span>CUIT</span>
            <input required maxLength={20} disabled={busy !== null} value={draft.tax_id} onChange={(event) => change("tax_id", event.target.value)} inputMode="numeric" aria-describedby="fiscal-cuit-help" />
            <small id="fiscal-cuit-help">11 dígitos, con o sin guiones.</small>
          </label>
          <label className="field">
            <span>Condición frente al IVA</span>
            <select required disabled={busy !== null} value={draft.tax_condition} onChange={(event) => change("tax_condition", event.target.value)}>
              <option value="">Elegí la condición fiscal</option>
              {fiscalConditions.map((condition) => <option key={condition} value={condition}>{fiscalConditionNames[condition]}</option>)}
            </select>
          </label>
          <label className="field full">
            <span>Domicilio fiscal completo</span>
            <input required minLength={5} maxLength={300} disabled={busy !== null} value={draft.fiscal_address} onChange={(event) => change("fiscal_address", event.target.value)} autoComplete="street-address" />
          </label>
          <label className="field">
            <span>Punto de venta autorizado</span>
            <input type="number" required min={1} max={99999} step={1} disabled={busy !== null} value={draft.point_of_sale} onChange={(event) => change("point_of_sale", event.target.value)} aria-describedby="fiscal-point-help" />
            <small id="fiscal-point-help">El número registrado para esta sede.</small>
          </label>
        </div>
        <p className="muted">{saved ? `Último guardado: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(saved.updated_at))}.` : "Esta sede todavía no tiene datos fiscales guardados."}</p>
        <div className="form-actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className="button small" disabled={busy !== null} onClick={() => void reload()}>{busy === "reload" ? "Cargando…" : "Cargar versión guardada de esta sede"}</button>
          <button type="submit" className="button gold small" disabled={busy !== null}>{busy === "save" ? "Guardando…" : "Guardar datos fiscales"}</button>
        </div>
      </form>
    </main>
  );
}
