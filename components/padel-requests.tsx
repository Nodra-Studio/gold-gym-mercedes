"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  deposit_expected: number;
  payment_method: string;
  has_receipt: number;
};
export default function PadelRequests({
  onChange,
  limit,
}: {
  onChange: () => void;
  limit?: number;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [deposits, setDeposits] = useState<Record<string, string>>({}),
    [prices, setPrices] = useState<Record<string, string>>({});
  const saving = useRef(false),
    pending = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const ticket = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;

    try {
      const r = await apiFetch("/api/padel-requests", {
          cache: "no-store",
          signal: controller.signal,
        }),
        j = (await r.json()) as { error?: string; requests: RequestRow[] };
      if (!r.ok) throw Error(j.error);
      if (ticket !== sequence.current || controller.signal.aborted) return;
      setRows(j.requests);
      setError("");
    } catch (e) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setError(
        e instanceof Error ? e.message : "No pudimos cargar las solicitudes.",
      );
    } finally {
      if (ticket === sequence.current) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void load();
    const sync = () => {
      if (
        document.visibilityState === "visible" &&
        !saving.current &&
        !pending.current
      )
        void load();
    };
    const timer = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      sequence.current++;
      pending.current?.abort();
    };
  }, [load]);
  async function act(id: string, action: "confirm" | "reject") {
    if (saving.current) return;
    saving.current = true;
    sequence.current++;
    pending.current?.abort();
    pending.current = null;
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
            method:
              rows.find((r) => r.id === id)?.payment_method ?? "Transferencia",
            ...(prices[id] ? { amount: Number(prices[id]) } : {}),
          }),
        }),
        j = (await r.json()) as { error?: string; requests: RequestRow[] };
      if (!r.ok) throw Error(j.error);
      setRows((current) => current.filter((row) => row.id !== id));
      void load();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      saving.current = false;
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
      {loading && (
        <p role="status" className="muted">
          Buscando solicitudes…
        </p>
      )}
      {!loading && !rows.length && !error && (
        <p className="muted">No hay solicitudes pendientes.</p>
      )}
      {rows.slice(0, limit ?? rows.length).map((r) => (
        <article className="request-row" key={r.id}>
          <div>
            <strong>{r.name}</strong>{" "}
            <small>#{r.id.slice(0, 8).toUpperCase()}</small>
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
            <p>
              Seña solicitada: {money(r.deposit_expected)} · {r.payment_method}
            </p>
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
      {limit && rows.length > limit && (
        <Link className="button small" href="/reservas">
          Ver las {rows.length} solicitudes en la agenda
        </Link>
      )}
    </section>
  );
}
