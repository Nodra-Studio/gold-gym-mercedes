"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import { money } from "@/lib/club";
import { ErrorNotice } from "@/components/club-client";
type History = {
  payments: {
    id: string;
    kind: string;
    amount: number;
    method: string;
    created_at: string;
  }[];
  undocumented: number;
};
export default function BookingPaymentHistory({
  bookingId,
}: {
  bookingId: string;
}) {
  const [data, setData] = useState<History | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    // Clear the previous booking before requesting this booking’s payment history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError("");
    void apiFetch("/api/booking-payments?" + new URLSearchParams({ bookingId }), {
      signal: controller.signal,
    })
      .then(async (r) => {
        const j = (await r.json()) as History & { error?: string };
        if (!r.ok) throw Error(j.error ?? "No se pudo cargar el historial.");
        setData(j);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [bookingId]);
  return (
    <section className="booking-payment-history">
      <h3>Historial de cobros</h3>
      <ErrorNotice error={error} />
      {!data && !error && <p role="status">Cargando cobros…</p>}
      {data && (
        <>
          {data.payments.length ? (
            <ul>
              {data.payments.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>
                      {p.kind === "deposit" ? "Seña" : "Saldo"} ·{" "}
                      {money(p.amount)}
                    </strong>
                    <span>
                      {p.method} ·{" "}
                      {new Intl.DateTimeFormat("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        dateStyle: "short",
                        timeStyle: "short",
                        hourCycle: "h23",
                      }).format(new Date(p.created_at))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No hay movimientos detallados.</p>
          )}
          {data.undocumented > 0 && (
            <p className="notice">
              {money(data.undocumented)} pagados sin detalle histórico de fecha
              o medio. Este importe se conserva en la reserva.
            </p>
          )}
        </>
      )}
    </section>
  );
}
