"use client";
import { apiFetch } from "@/lib/api-fetch";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  localDay,
  addDays,
  slots,
  timeLabel,
  money,
  dateLabel,
  slotPassed,
  requestId,
} from "@/lib/club";
import {
  ErrorNotice,
  Loading,
  FormModal,
  SaveButton,
} from "@/components/club-client";
type Reservation = {
  id: string;
  court: number;
  day: string;
  start: number;
  status: string;
  amount: number;
  deposit: number;
};
type Portal = {
  day: string;
  today: string;
  settings: { padel_price: number; booking_days: number; cancel_hours: number };
  occupied: { court: number; start: number }[];
  mine: Reservation[];
};
export default function PlayerClient() {
  const [day, setDay] = useState(localDay()),
    [data, setData] = useState<Portal | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<{
      court: number;
      start: number;
      key: string;
      price: number;
    } | null>(null),
    [cancel, setCancel] = useState<Reservation | null>(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const r = await apiFetch("/api/player?day=" + day, { cache: "no-store" }),
        j = (await r.json()) as Portal & { error?: string };
      if (!r.ok) throw Error(j.error);
      if (version !== requestVersion.current) return;
      setData(j);
      setError("");
    } catch (e) {
      if (version === requestVersion.current) {
        setData(null);
        setError(e instanceof Error ? e.message : "No se pudo cargar.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [day]);
  // Fetches remote availability when the selected date changes.
  useEffect(() => {
    // Loading belongs to this remote request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function mutate(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        j = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(j.error);
      setSelected(null);
      setCancel(null);
      await load();
      setNotice("Listo. Tus reservas están actualizadas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <Link href="/padel" className="text-link">
        ← Gold Gym Pádel
      </Link>
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / MIS PARTIDOS</p>
          <h1>Elegí cancha. Armá el partido.</h1>
          <p>Reservas de tu cuenta · pago coordinado con el club</p>
        </div>
        <Link className="button small" href="/cuenta">
          Mi acceso
        </Link>
      </header>
      <p className="notice">
        Reservá directamente con Gold Gym y encontrá tus partidos en un solo lugar.
        Si tu cuenta todavía no está habilitada, consultá en recepción.
      </p>
      {!selected && !cancel && <ErrorNotice error={error} />}{" "}
      {notice && (
        <p role="status" className="success-box">
          {notice}
        </p>
      )}
      {loading && <Loading />}
      {!loading && !data && <div className="connection-empty"><button className="button gold" onClick={() => void load()}>Volver a cargar</button><Link className="button" href="/acceso?returnTo=/jugar">Iniciar sesión</Link></div>}
      {data && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Disponibilidad</h2>
              <button
                className="button small"
                disabled={busy}
                onClick={() => void load()}
              >
                Actualizar disponibilidad
              </button>
              <label>
                Fecha{" "}
                <input
                  aria-label="Fecha para jugar"
                  type="date"
                  min={data.today}
                  max={addDays(data.today, data.settings.booking_days)}
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDay(e.target.value);
                      setNotice("");
                    }
                  }}
                />
              </label>
            </div>
            <p className="muted">
              90 minutos · {money(data.settings.padel_price)} por turno ·
              cancelación desde el portal hasta {data.settings.cancel_hours}{" "}
              horas antes, si no hay pagos registrados.
            </p>
            <div className="calendar-wrap" style={{ marginTop: 24 }}>
              <div className="calendar-grid">
                <span />
                {[1, 2, 3, 4].map((c) => (
                  <div className="court-head" key={c}>
                    CANCHA {c}
                  </div>
                ))}
                {slots.map((start) => (
                  <PlayerRow
                    key={start}
                    start={start}
                    data={data}
                    disabled={busy || loading || !!error || data.day !== day}
                    onPick={(court) => {
                      setError("");
                      setSelected({
                        court,
                        start,
                        key: requestId(),
                        price: data.settings.padel_price,
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Mis reservas</h2>
            <p className="muted" style={{ marginTop: 12 }}>
              Se muestran hasta 100 reservas recientes de esta cuenta.
            </p>
            {data.mine.map((b) => (
              <div className="list-row" key={b.id}>
                <div>
                  <strong>
                    Cancha {b.court} · {dateLabel(b.day)} · {timeLabel(b.start)}
                  </strong>
                  <p className="muted">
                    {b.status === "cancelled"
                      ? "Cancelada"
                      : `${money(b.amount - b.deposit)} pendiente · ${money(b.deposit)} registrado`}
                  </p>
                </div>
                {b.status === "confirmed" && (
                  <button
                    className="button small"
                    onClick={() => {
                      setError("");
                      setCancel(b);
                    }}
                  >
                    Cancelar reserva
                  </button>
                )}
              </div>
            ))}
            {!data.mine.length && (
              <p className="empty">Todavía no reservaste una cancha.</p>
            )}
          </section>
        </>
      )}
      <FormModal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Confirmar tu partido"
        description={
          selected
            ? `Cancha ${selected.court} · ${dateLabel(day)} · ${timeLabel(selected.start)} a ${timeLabel(selected.start + 90)}`
            : ""
        }
      >
        <ErrorNotice error={error} />
        {selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "book",
                day,
                court: selected.court,
                start: selected.start,
                expectedPrice: selected.price,
                requestKey: selected.key,
              });
            }}
          >
            <p>
              Total: <strong>{money(selected.price)}</strong>
            </p>
            <p className="muted" style={{ margin: "18px 0" }}>
              Al confirmar se ocupa el turno para tu cuenta. El pago se coordina
              con el club; no se procesa un pago online.
            </p>
            <SaveButton busy={busy}>Confirmar reserva</SaveButton>
          </form>
        )}
      </FormModal>
      <FormModal
        open={!!cancel}
        onClose={() => {
          if (!busy) setCancel(null);
        }}
        title="Cancelar tu reserva"
        description={
          cancel
            ? `Cancha ${cancel.court} · ${dateLabel(cancel.day)} · ${timeLabel(cancel.start)}`
            : ""
        }
      >
        <ErrorNotice error={error} />
        <p className="muted" style={{ marginBottom: 20 }}>
          Se liberará el turno. Si ya pagaste o no estás dentro del plazo, el
          club debe gestionar la cancelación.
        </p>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            cancel && void mutate({ action: "cancel", id: cancel.id })
          }
        >
          {busy ? "Cancelando…" : "Confirmar cancelación"}
        </button>
      </FormModal>
    </main>
  );
}
function PlayerRow({
  start,
  data,
  disabled,
  onPick,
}: {
  start: number;
  data: Portal;
  disabled: boolean;
  onPick: (court: number) => void;
}) {
  return (
    <>
      <div className="time-label">{timeLabel(start)}</div>
      {[1, 2, 3, 4].map((c) => {
        const occupied = data.occupied.some(
            (b) => b.court === c && b.start === start,
          ),
          passed = slotPassed(data.day, start);
        return (
          <button
            key={c}
            className={"slot " + (occupied ? "blocked" : "")}
            disabled={disabled || occupied || passed}
            aria-label={`Cancha ${c}, ${timeLabel(start)}, ${occupied ? "ocupada" : passed ? "finalizado" : "reservar"}`}
            onClick={() => onPick(c)}
          >
            {occupied ? "Ocupado" : passed ? "Finalizado" : "Reservar"}
          </button>
        );
      })}
    </>
  );
}
