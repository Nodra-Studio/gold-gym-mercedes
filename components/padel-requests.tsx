"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { money, dateLabel, timeLabel } from "@/lib/club";
type RequestRow = {
  id: string;
  court: number;
  day: string;
  start: number;
  name: string;
  phone: string;
  amount: number;
  deposit_expected:number;payment_method:string;
  has_receipt: number;
};
export default function PadelRequests({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [deposits, setDeposits] = useState<Record<string, string>>({}),
    [prices, setPrices] = useState<Record<string, string>>({});
  async function load() {
    try {
      const r = await apiFetch("/api/padel-requests"),
        j = (await r.json()) as { error?: string; requests: RequestRow[] };
      if (!r.ok) throw Error(j.error);
      setRows(j.requests);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar las solicitudes.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(id: string, action: "confirm" | "reject") {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const r = await apiFetch("/api/padel-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action,
            deposit: Number(deposits[id] || 0),
            method:rows.find(r=>r.id===id)?.payment_method??"Transferencia",
            ...(prices[id] ? { amount: Number(prices[id]) } : {}),
          }),
        }),
        j = (await r.json()) as { error?: string; requests: RequestRow[] };
      if (!r.ok) throw Error(j.error);
      await load();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel public-requests">
      <div className="panel-heading">
        <h2>Solicitudes online {rows.length > 0 && `(${rows.length})`}</h2>
        <button
          className="button small"
          onClick={() => void load()}
          disabled={!!busy}
        >
          Actualizar
        </button>
      </div>
      <p className="muted">
        Revisá el comprobante y el dinero recibido antes de confirmar. Avisale
        al cliente por WhatsApp: no se envían mensajes automáticos.
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!rows.length && !error && (
        <p className="muted">No hay solicitudes pendientes.</p>
      )}
      {rows.map((r) => (
        <article className="request-row" key={r.id}>
          <div>
            <strong>{r.name}</strong> <small>#{r.id.slice(0,8).toUpperCase()}</small>
            <p>
              Cancha {r.court} · {dateLabel(r.day)} · {timeLabel(r.start)} ·{" "}
              {r.amount ? money(r.amount) : "Tarifa a confirmar"}
            </p>
            <a
              href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contactar · {r.phone}
            </a>
            {!!r.has_receipt && (
              <>
                {" "}
                ·{" "}
                <a
                  href={`/api/padel-requests?receipt=${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Descargar comprobante
                </a>
              </>
            )}
          <p>Seña solicitada: {money(r.deposit_expected)} · {r.payment_method}</p>
          </div>
            <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(r.id, "confirm");
            }}
          >
            <label>
              Precio acordado del turno (ARS)
              <input
                type="number"
                min="1"
                max="10000000"
                step="1"
                required
                value={prices[r.id] ?? (r.amount ? String(r.amount) : "")}
                onChange={(e) =>
                  setPrices({ ...prices, [r.id]: e.target.value })
                }
              />
            </label>
            <label>
              Pago verificado (ARS)
              <input
                type="number"
                min="0"
                max={Number(prices[r.id] || r.amount) || 10000000}
                step="1"
                value={deposits[r.id] ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setDeposits({ ...deposits, [r.id]: e.target.value })
                }
              />
            </label>
            <button className="button gold" disabled={!!busy}>
              Confirmar turno
            </button>
            <button
              type="button"
              className="button"
              disabled={!!busy}
              onClick={() => void act(r.id, "reject")}
            >
              Rechazar
            </button>
          </form>
        </article>
      ))}
    </section>
  );
}
