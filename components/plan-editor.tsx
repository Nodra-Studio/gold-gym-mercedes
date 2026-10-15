"use client";
import { useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { planPresets } from "@/lib/plan-presets";

export type Plan = {
  id: string;
  name: string;
  days: number;
  price: number;
  published: number;
  access_scope: "gym" | "pilates" | "all";
};
export type Padel = {
  padel_price: number;
  deposit_percent: number;
  payment_alias: string;
  whatsapp: string;
  revision: number;
};
export type TariffData = { role: string; plans: Plan[]; padel: Padel };
export type SaveOutcome =
  | { ok: true; data: TariffData; createdId?: string }
  | { ok: false; uncertain: boolean };
export type SaveTariff = (value: Record<string, unknown>) => Promise<SaveOutcome>;

export function OwnerOnly({ locked }: { locked: boolean }) {
  return locked ? (
    <span className="tariff-permission"><LockKeyhole size={14} aria-hidden="true" /> Solo dueños</span>
  ) : null;
}

export function CreatePlanEditor({ busy, save, onCreated, onCancel }: {
  busy: boolean;
  save: SaveTariff;
  onCreated: (id?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [days, setDays] = useState("30"),
    [scope, setScope] = useState<Plan["access_scope"]>("gym"),
    [published, setPublished] = useState(false),
    [preset, setPreset] = useState(""),
    [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const submitRef = useRef(false), pendingRef = useRef<Record<string, unknown> | null>(null);
  const locked = busy || !!pending;
  return (
    <form className="plan-create" aria-label="Crear plan" onSubmit={async (event) => {
      event.preventDefault();
      if (submitRef.current || busy) return;
      submitRef.current = true;
      const value = pendingRef.current ?? {
        kind: "createPlan", name: name.trim(), price: Number(price), days: Number(days),
        accessScope: scope, published, requestKey: crypto.randomUUID(),
      };
      pendingRef.current = value;
      setPending(value);
      try {
        const result = await save(value);
        if (result.ok) {
          onCreated(result.createdId);
        } else if (!result.uncertain) {
          pendingRef.current = null;
          setPending(null);
        }
      } finally {
        submitRef.current = false;
      }
    }}>
      <h3>Nuevo plan</h3>
      <p className="muted">Elegí un modelo o armá uno personalizado. El importe lo definís vos.</p>
      <fieldset disabled={locked} className="tariff-fields plan-create-fields">
        <label className="tariff-full">Modelo de plan (opcional)
          <select value={preset} onChange={(event) => {
            const selected = event.target.value;
            setPreset(selected);
            const model = planPresets.find((p) => p.id === selected);
            if (model) { setName(model.name); setScope(model.scope); }
          }}>
            <option value="">Personalizado</option>
            {planPresets.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="tariff-full">Nombre del plan
          <input name="name" required minLength={2} maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setPreset(""); }} />
        </label>
        <label>Precio por período (ARS)
          <input name="price" type="number" required min="0" max="10000000" step="1" value={price} onChange={(event) => setPrice(event.target.value)} />
          <small>Ingresá el precio definitivo. Para un plan gratuito, escribí 0.</small>
        </label>
        <label>Días de vigencia
          <input name="days" type="number" required min="1" max="366" step="1" value={days} onChange={(event) => setDays(event.target.value)} />
        </label>
        <label className="tariff-full">Acceso incluido
          <select name="scope" value={scope} onChange={(event) => { setScope(event.target.value as Plan["access_scope"]); setPreset(""); }}>
            <option value="gym">Gimnasios (sin Pilates)</option>
            <option value="pilates">Solo Pilates</option>
            <option value="all">Gimnasios y Pilates</option>
          </select>
        </label>
        <label className="tariff-check tariff-full">
          <input name="published" type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          Mostrar precio en el sitio
        </label>
      </fieldset>
      {pending && !busy && <p className="tariff-retry" role="status">El envío quedó pendiente de confirmar. Reintentá el mismo guardado para comprobarlo sin crear otro plan.</p>}
      <div className="tariff-actions">
        <button className="button gold" disabled={busy}>{busy ? "Guardando…" : pending ? "Reintentar el mismo guardado" : "Crear plan"}</button>
        <button className="button" type="button" onClick={onCancel} disabled={busy || !!pending}>Cancelar</button>
      </div>
    </form>
  );
}

function planDraft(plan: Plan) {
  return { name: plan.name, price: String(plan.price), days: String(plan.days), scope: plan.access_scope, published: !!plan.published };
}
function planVersion(plan: Plan) { return JSON.stringify([plan.name, plan.price, plan.days, plan.published, plan.access_scope]); }

export function ExistingPlanEditor({ plan, owner, busy, save }: {
  plan: Plan; owner: boolean; busy: boolean; save: SaveTariff;
}) {
  // Keep the version opened by this form: another card's refresh must not overwrite a draft or its conflict check.
  const [base, setBase] = useState(plan), [draft, setDraft] = useState(() => planDraft(plan));
  const submitRef = useRef(false);
  const stale = planVersion(base) !== planVersion(plan);
  return (
    <form className="plan-editor" tabIndex={-1} id={`plan-${plan.id}`} aria-label={`Editar ${base.name}`} onSubmit={async (event) => {
      event.preventDefault();
      if (submitRef.current || busy) return;
      submitRef.current = true;
      try {
        const result = await save({
          kind: "plan", id: base.id, price: Number(draft.price), published: draft.published,
          accessScope: owner ? draft.scope : base.access_scope,
          expectedPrice: base.price, expectedPublished: base.published, expectedScope: base.access_scope,
          ...(owner ? { name: draft.name.trim(), days: Number(draft.days), expectedName: base.name, expectedDays: base.days } : {}),
        });
        if (result.ok) {
          const updated = result.data.plans.find((p) => p.id === base.id);
          if (updated) { setBase(updated); setDraft(planDraft(updated)); }
        }
      } finally { submitRef.current = false; }
    }}>
      <div className="plan-editor-heading"><h3>{base.name}</h3><span className={`tariff-publication ${base.published ? "is-published" : ""}`}>{base.published ? "Precio publicado" : "Precio sin publicar"}</span></div>
      <fieldset disabled={busy} className="tariff-fields">
        <label>Nombre del plan <OwnerOnly locked={!owner} />
          <input name="name" minLength={2} maxLength={80} required value={draft.name} disabled={!owner} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>Días de vigencia <OwnerOnly locked={!owner} />
          <input name="days" type="number" required min="1" max="366" step="1" value={draft.days} disabled={!owner} onChange={(event) => setDraft({ ...draft, days: event.target.value })} />
        </label>
        <label>Precio por período (ARS)
          <input name="price" type="number" required min="0" max="10000000" step="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
        </label>
        <label>Acceso incluido <OwnerOnly locked={!owner} />
          <select name="scope" value={draft.scope} disabled={!owner} onChange={(event) => setDraft({ ...draft, scope: event.target.value as Plan["access_scope"] })}>
            <option value="gym">Gimnasios (sin Pilates)</option><option value="pilates">Solo Pilates</option><option value="all">Gimnasios y Pilates</option>
          </select>
          {owner && <small className="tariff-retry">Cambiar las actividades modifica el acceso de todos los socios con este plan.</small>}
        </label>
        <label className="tariff-check tariff-full"><input name="published" type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Mostrar precio en el sitio</label>
      </fieldset>
      {stale && <p className="tariff-retry">Este plan cambió desde que lo abriste. Conservamos tu borrador. <button className="tariff-text-button" type="button" disabled={busy} onClick={() => { setBase(plan); setDraft(planDraft(plan)); }}>Cargar la versión actual</button></p>}
      <button className="button gold" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}

export function PadelEditor({ padel, owner, busy, save }: { padel: Padel; owner: boolean; busy: boolean; save: SaveTariff }) {
  const [base, setBase] = useState(padel), [draft, setDraft] = useState(() => ({ price: String(padel.padel_price), deposit: String(padel.deposit_percent), alias: padel.payment_alias, whatsapp: padel.whatsapp }));
  const submitRef = useRef(false), stale = base.revision !== padel.revision;
  return <form className="panel" onSubmit={async (event) => {
    event.preventDefault();
    if (submitRef.current || busy) return;
    submitRef.current = true;
    try {
      const result = await save({ kind: "padel", price: Number(draft.price), depositPercent: Number(draft.deposit), alias: owner ? draft.alias : base.payment_alias, whatsapp: owner ? draft.whatsapp.replace(/\D/g, "") : base.whatsapp, expectedRevision: base.revision });
      if (result.ok) {
        const updated = result.data.padel;
        setBase(updated);
        setDraft({ price: String(updated.padel_price), deposit: String(updated.deposit_percent), alias: updated.payment_alias, whatsapp: updated.whatsapp });
      }
    } finally { submitRef.current = false; }
  }}>
    <h2>Turnos de pádel</h2>
    <p className="muted">El precio por cancha se publica al guardar. La seña se calcula como porcentaje de esa tarifa.</p>
    <fieldset disabled={busy} className="tariff-fields">
      <label>Turno de 90 minutos (ARS)<input name="price" type="number" required min="0" max="10000000" step="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></label>
      <label>Seña (%)<input name="depositPercent" type="number" required min="0" max="100" step="1" value={draft.deposit} onChange={(event) => setDraft({ ...draft, deposit: event.target.value })} /><small>0: sin seña establecida.</small></label>
      <label>Alias o CBU para transferencias <OwnerOnly locked={!owner} /><input name="alias" maxLength={100} value={draft.alias} disabled={!owner} onChange={(event) => setDraft({ ...draft, alias: event.target.value })} /></label>
      <label>WhatsApp de recepción <OwnerOnly locked={!owner} /><input name="whatsapp" type="tel" placeholder="5492324123456" value={draft.whatsapp} disabled={!owner} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} /><small>Con código de país. Se usa para enviar el turno y el comprobante.</small></label>
    </fieldset>
    {stale && <p className="tariff-retry">La tarifa de pádel cambió desde que la abriste. Conservamos tu borrador. <button className="tariff-text-button" type="button" disabled={busy} onClick={() => { setBase(padel); setDraft({ price: String(padel.padel_price), deposit: String(padel.deposit_percent), alias: padel.payment_alias, whatsapp: padel.whatsapp }); }}>Cargar la versión actual</button></p>}
    <button className="button gold" disabled={busy}>{busy ? "Guardando…" : "Guardar tarifa de pádel"}</button>
  </form>;
}
