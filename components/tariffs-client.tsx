"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, LockKeyhole } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-fetch";
import {
  CreatePlanEditor,
  ExistingPlanEditor,
  PadelEditor,
  type SaveOutcome,
  type TariffData,
} from "@/components/plan-editor";
import "@/app/tariffs-self-service.css";

export function useTariffs() {
  const [data, setData] = useState<TariffData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const alive = useRef(true), busyRef = useRef(false), read = useRef<AbortController | null>(null), version = useRef(0);

  const load = useCallback(async (afterSave = false): Promise<TariffData | null> => {
    if (busyRef.current && !afterSave) return null;
    const current = ++version.current, controller = new AbortController();
    read.current?.abort();
    read.current = controller;
    if (alive.current) { setError(""); setLoading(true); }
    try {
      const response = await apiFetch("/api/tariffs", { signal: controller.signal }),
        result = await response.json() as TariffData & { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos cargar los planes.");
      if (!Array.isArray(result.plans) || !result.padel || typeof result.role !== "string") throw new Error("No pudimos leer los datos de planes y tarifas.");
      if (!alive.current || current !== version.current || controller.signal.aborted) return null;
      setData(result);
      return result;
    } catch (cause) {
      if (alive.current && current === version.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "No pudimos cargar los planes.");
      return null;
    } finally {
      if (alive.current && current === version.current) setLoading(false);
      if (read.current === controller) read.current = null;
    }
  }, []);

  const cancelReads = useCallback(() => { ++version.current; read.current?.abort(); }, []);
  useEffect(() => {
    let active = true;
    alive.current = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; alive.current = false; cancelReads(); };
  }, [load, cancelReads]);

  const save = useCallback(async (value: Record<string, unknown>): Promise<SaveOutcome> => {
    if (busyRef.current) return { ok: false, uncertain: false };
    busyRef.current = true;
    ++version.current;
    read.current?.abort();
    if (alive.current) { setBusy(true); setLoading(false); setError(""); setNotice(""); }
    let definiteRejection = false;
    try {
      const response = await apiFetch("/api/tariffs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
      });
      if (!response.ok) definiteRejection = response.status < 500;
      const result = await response.json() as { ok?: boolean; id?: string; planId?: string; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error || "No pudimos confirmar el guardado.");
      const fresh = await load(true);
      if (!fresh) {
        if (alive.current) setError("El cambio quedó guardado, pero no pudimos actualizar la pantalla. Volvé a cargar los datos. Si estabas creando un plan, podés reintentar el mismo guardado sin duplicarlo.");
        return { ok: false, uncertain: true };
      }
      if (alive.current) setNotice(value.kind === "createPlan"
        ? "Plan creado. Ya podés usarlo al registrar una membresía. Podés cambiar su precio y publicación desde esta pantalla."
        : value.kind === "padel"
          ? "Tarifa de pádel guardada. Se aplica a las nuevas consultas y reservas. Los importes ya registrados no cambian."
          : "Plan actualizado. El precio y la vigencia se aplican a los próximos cobros y renovaciones. Los pagos registrados y las fechas de vencimiento no cambian.");
      return { ok: true, data: fresh, createdId: result.id ?? result.planId };
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "No pudimos guardar.");
      return { ok: false, uncertain: !definiteRejection && !(cause instanceof ApiError && cause.status === 401) };
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }, [load]);
  return { data, error, busy, loading, notice, load, save };
}

export default function Tariffs({ initialCreate = false }: { initialCreate?: boolean }) {
  const { data, error, busy, loading, notice, load, save } = useTariffs();
  const [creating, setCreating] = useState(initialCreate), [createdId, setCreatedId] = useState<string | undefined>();
  useEffect(() => {
    if (createdId && data?.plans.some((plan) => plan.id === createdId))
      document.getElementById(`plan-${createdId}`)?.focus();
  }, [createdId, data]);
  const owner = data?.role === "owner";
  const canEdit = owner || (data?.activity_scope === "all" && data?.branch_scope === "all");
  return (
    <main className="workspace tariffs-workspace">
      <header className="work-header">
        <div>
          <h1>Planes y membresías</h1>
          <p className="muted">Creá planes y actualizá sus precios. Los precios y la vigencia se aplican a los próximos cobros y renovaciones. Los pagos registrados y las fechas de vencimiento no cambian.</p>
        </div>
      </header>
      {error && <p role="alert" className="error-box">{error}{" "}<button className="button small" disabled={busy || loading} onClick={() => void load()}>Actualizar datos</button></p>}
      {notice && <p role="status" className="success-box">{notice}</p>}
      {!data && loading && <p role="status">Cargando planes y tarifas…</p>}
      {data && <>
        {!canEdit && <p className="notice"><LockKeyhole size={16} aria-hidden="true"/> Las tarifas se comparten entre sedes. Para modificarlas necesitás ser dueño o tener acceso general de recepción.</p>}
        <fieldset disabled={!canEdit || busy} className="tariffs-scope-fieldset">
        <section className="panel" aria-labelledby="plans-heading">
          <div className="tariffs-toolbar">
            <div><h2 id="plans-heading">Planes disponibles</h2><p className="muted">Dueños y recepción pueden crear planes, ajustar precios y decidir cuáles se muestran en el sitio.</p></div>
            {!creating && <button className="button gold" disabled={busy} onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> Crear plan</button>}
          </div>
          <p className="tariffs-role-note"><LockKeyhole size={16} aria-hidden="true" /> {owner ? "Como dueño, también podés cambiar el nombre, la vigencia y los accesos de los planes existentes." : "Solo los dueños pueden cambiar el nombre, la vigencia y los accesos de los planes existentes. Esas opciones aparecen con un candado."}</p>
          {creating && canEdit && <CreatePlanEditor busy={busy} save={save} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setCreatedId(id); }} />}
          {!data.plans.length && !creating && <div className="tariffs-empty"><h3>Todavía no hay planes</h3><p>Creá el primer plan con el nombre, precio y vigencia que usa el club. Después estará disponible para registrar las membresías.</p></div>}
          {data.plans.map((plan) => <ExistingPlanEditor key={plan.id} plan={plan} owner={owner} busy={busy} save={save} />)}
        </section>
        <PadelEditor padel={data.padel} owner={owner} busy={busy} save={save} />
        </fieldset>
      </>}
    </main>
  );
}
