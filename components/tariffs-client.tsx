"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
type Plan = {
  id: string;
  name: string;
  days: number;
  price: number;
  published: number;
  access_scope: "gym" | "pilates" | "all";
};
type Padel = {
  padel_price: number;
  deposit_percent: number;
  payment_alias: string;
  whatsapp: string;
  revision: number;
};
export default function Tariffs() {
  const [data, setData] = useState<{
      role: string;
      plans: Plan[];
      padel: Padel;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const r = await apiFetch("/api/tariffs"),
        j = (await r.json()) as NonNullable<typeof data> & { error?: string };
      if (!r.ok) throw Error(j.error);
      setData(j);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar las tarifas.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(value: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await apiFetch("/api/tariffs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }),
        j = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(j.error);
      await load();
      setNotice(
        "Tarifa actualizada. Ya se aplica a nuevas consultas, reservas y cobros. Los importes anteriores se conservan.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <header className="work-header">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN / TARIFAS</p>
          <h1>Un precio. En todo el club.</h1>
          <p className="muted">
            Cambios para el sitio, los turnos y los próximos cobros. Las
            reservas y pagos ya registrados mantienen su importe.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="error-box">
          {error}{" "}
          <button
            className="button small"
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Actualizar
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="success-box">
          {notice}
        </p>
      )}
      {!data && !error && <p>Cargando tarifas…</p>}
      {data && (
        <>
          <section className="panel">
            <h2>Planes y membresías</h2>
            <p className="muted">
              Revisá las tarifas de demostración antes de publicarlas. Activá
              “Mostrar en el sitio” para que cada precio aparezca en su sección.
            </p>
            {data.plans.map((p) => (
              <form
                className="tariff-row"
                key={[p.id, p.price, p.published, p.access_scope].join(":")}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    kind: "plan",
                    id: p.id,
                    price: Number(f.get("price")),
                    published: f.has("published"),
                    accessScope: f.get("scope") ?? p.access_scope,
                    expectedPrice: p.price,
                    expectedPublished: p.published,
                    expectedScope: p.access_scope,
                  });
                }}
              >
                <div>
                  <strong>{p.name}</strong>
                  <p>{p.days} días de vigencia</p>
                </div>
                <label>
                  Precio (ARS)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    max="10000000"
                    step="1"
                    required
                    defaultValue={p.price}
                    disabled={busy}
                  />
                </label>
                <label>
                  Acceso incluido
                  <select
                    name="scope"
                    defaultValue={p.access_scope}
                    disabled={busy || data.role !== "owner"}
                  >
                    <option value="gym">Gimnasios</option>
                    <option value="pilates">Pilates</option>
                    <option value="all">Gimnasios y Pilates</option>
                  </select>
                </label>
                <label className="tariff-check">
                  <input
                    name="published"
                    type="checkbox"
                    defaultChecked={!!p.published}
                    disabled={busy}
                  />
                  Mostrar en el sitio
                </label>
                <button className="button gold" disabled={busy}>
                  Guardar
                </button>
              </form>
            ))}
          </section>
          <form
            key={data.padel.revision}
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save({
                kind: "padel",
                price: Number(f.get("price")),
                depositPercent: Number(f.get("depositPercent")),
                alias: f.get("alias"),
                whatsapp: String(f.get("whatsapp")).replace(/\D/g, ""),
                expectedRevision: data.padel.revision,
              });
            }}
          >
            <h2>Turnos de pádel</h2>
            <p className="muted">
              El precio por cancha se publica al guardar. La seña se calcula
              como porcentaje de esa tarifa.
            </p>
            <fieldset disabled={busy} className="tariff-fields">
              <label>
                Turno de 90 minutos (ARS)
                <input
                  name="price"
                  type="number"
                  required
                  min="0"
                  max="10000000"
                  step="1"
                  defaultValue={data.padel.padel_price}
                />
              </label>
              <label>
                Seña (%)
                <input
                  name="depositPercent"
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={data.padel.deposit_percent}
                />
                <small>0: sin seña establecida.</small>
              </label>
              <label>
                Alias o CBU para transferencias
                <input
                  name="alias"
                  maxLength={100}
                  defaultValue={data.padel.payment_alias}
                />
              </label>
              <label>
                WhatsApp de recepción
                <input
                  name="whatsapp"
                  type="tel"
                  placeholder="5492324123456"
                  defaultValue={data.padel.whatsapp}
                />
                <small>
                  Con código de país. Se usa para enviar el turno y el
                  comprobante.
                </small>
              </label>
            </fieldset>
            <button className="button gold" disabled={busy}>
              Guardar tarifa de pádel
            </button>
          </form>
        </>
      )}
    </main>
  );
}
