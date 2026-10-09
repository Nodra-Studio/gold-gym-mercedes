"use client";
import { useState } from "react";
import { money } from "@/lib/club";
export default function CashReconciliation({
  enabled,
  rows,
  day,
  venue,
}: {
  enabled: boolean;
  rows: { method: string | null; balance: number }[];
  day: string;
  venue: string;
}) {
  const [opening, setOpening] = useState(""),
    [cash, setCash] = useState(""),
    [transfer, setTransfer] = useState("");
  const balance = (method: string) =>
    rows.find((r) => r.method === method)?.balance ?? 0;
  const cashReady =
    opening !== "" && cash !== "" && Number(opening) >= 0 && Number(cash) >= 0;
  const difference = (actual: number, expected: number) => {
    const value = Math.round((actual - expected) * 100) / 100;
    return value === 0
      ? "Coincide con lo registrado"
      : `${value > 0 ? "Sobrante" : "Faltante"}: ${money(Math.abs(value))}`;
  };
  return (
    <section className="cash-reconciliation" aria-label="Control de caja">
      <h2>Control de caja</h2>
      {!enabled ? (
        <p>
          Elegí una sola fecha, una sucursal y todas las categorías para
          comparar el dinero con los movimientos de ese día.
        </p>
      ) : (
        <>
          <p>
            {venue} · {day}. Incluye cuotas, pádel, ventas, gastos y
            anulaciones.
          </p>
          <div className="cash-count-grid">
            <label>
              Fondo inicial en efectivo (ARS)
              <input
                type="number"
                min="0"
                step="0.01"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="Ingresá el fondo de apertura"
              />
            </label>
            <label>
              Efectivo contado (ARS)
              <input
                type="number"
                min="0"
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="Contá el efectivo de la caja"
              />
            </label>
            <label>
              Neto verificado por transferencias (ARS)
              <input
                type="number"
                step="0.01"
                value={transfer}
                onChange={(e) => setTransfer(e.target.value)}
                placeholder="Entradas menos salidas del día"
              />
            </label>
          </div>
          <div className="cash-count-results" aria-live="polite">
            <p>
              <strong>Efectivo esperado: </strong>
              {opening === ""
                ? "Ingresá el fondo inicial"
                : money(Number(opening) + balance("Efectivo"))}
              {cashReady && (
                <span>
                  {difference(
                    Number(cash),
                    Number(opening) + balance("Efectivo"),
                  )}
                </span>
              )}
            </p>
            <p>
              <strong>Transferencias registradas: </strong>
              {money(balance("Transferencia"))}
              {transfer !== "" && (
                <span>
                  {difference(Number(transfer), balance("Transferencia"))}
                </span>
              )}
            </p>
          </div>
          <p className="muted">
            Comparación de trabajo: no guarda un cierre ni modifica movimientos.
            Incluí únicamente las transferencias de esta sede y fecha; registrá
            retiros o ingresos faltantes antes de conciliar. El conteo se borra
            al cambiar los filtros o salir.
          </p>
        </>
      )}
    </section>
  );
}
