"use client";
import PadelRequests from "@/components/padel-requests";
import BookingPaymentHistory from "@/components/booking-payment-history";
import { requestId, slotPassed } from "@/lib/club";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import {
  useClub,
  WorkspaceHeader,
  ErrorNotice,
  Loading,
  FormModal,
  Field,
  SelectField,
  Option,
  SaveButton,
} from "@/components/club-client";
import {
  localDay,
  addDays,
  dateLabel,
  money,
  timeLabel,
  slots,
  type Booking,
} from "@/lib/club";
export default function PadelAgenda() {
  const { data, error, busy, loading, refresh, mutate, setError } = useClub();
  const [day, setDay] = useState(localDay()),
    [slot, setSlot] = useState<{
      court: number;
      start: number;
    } | null>(null),
    [detail, setDetail] = useState<Booking | null>(null),
    [notice, setNotice] = useState(""),
    [method, setMethod] = useState("Efectivo");
  const bookings =
      data?.bookings.filter((b) => b.day === day && b.status === "confirmed") ??
      [],
    played = bookings.filter((b) => b.kind === "booking");
  const open = (court: number, start: number) => {
    const b = bookings.find((b) => b.court === court && b.start === start);
    setError("");
    setNotice("");
    if (b) setDetail(b);
    else setSlot({ court, start });
  };
  async function save(p: Record<string, unknown>) {
    try {
      await mutate(p);
      setSlot(null);
      setNotice("Reserva guardada. La agenda ya está actualizada.");
    } catch {}
  }
  return (
    <main className="workspace">
      <WorkspaceHeader
        active="reservas"
        title="El próximo partido, organizado."
        subtitle="Agenda de las cuatro canchas · Unión Gold Club"
      />
      <ErrorNotice error={slot || detail ? "" : error} />
      {notice && (
        <div className="success-box" role="status">
          {notice}
        </div>
      )}
      {data && <PadelRequests onChange={() => void refresh()} />}
      {data && (
        <div className="stats">
          <div className="stat">
            <span>RESERVAS DEL DÍA</span>
            <strong>{played.length}</strong>
            <small>{dateLabel(day)}</small>
          </div>
          <div className="stat">
            <span>TURNOS DISPONIBLES</span>
            <strong>
              {slots.filter((s) => !slotPassed(day, s)).length * 4 -
                bookings.filter((b) => !slotPassed(day, b.start)).length}
            </strong>
            <small>Disponibilidad del club</small>
          </div>
          <div className="stat">
            <span>TOTAL RESERVADO</span>
            <strong>{money(played.reduce((s, b) => s + b.amount, 0))}</strong>
            <small>Importe previsto</small>
          </div>
          <div className="stat">
            <span>PAGADO REGISTRADO</span>
            <strong>{money(played.reduce((s, b) => s + b.deposit, 0))}</strong>
            <small>No procesa pagos online</small>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div className="date-controls">
            <button
              className="icon-button"
              aria-label="Día anterior"
              onClick={() => setDay(addDays(day, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Fecha de la agenda"
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="Día siguiente"
              onClick={() => setDay(addDays(day, 1))}
            >
              <ChevronRight size={18} />
            </button>
            <button className="button small" onClick={() => setDay(localDay())}>
              Hoy
            </button>
          </div>
          <div>
            <button
              className="icon-button"
              aria-label="Actualizar agenda"
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} />
            </button>
            <span className="muted">Elegí un horario libre para reservar</span>
          </div>
        </div>
        <div className="legend">
          <span>
            <i /> Disponible
          </span>
          <span>
            <i className="booked" /> Reservado
          </span>
          <span>
            <i className="blocked" /> Bloqueado
          </span>
        </div>
        {loading && !data ? (
          <Loading />
        ) : !data ? (
          <div className="connection-empty">
            <p>
              No pudimos consultar la agenda. Los horarios no están disponibles
              hasta recuperar la conexión.
            </p>
            <button className="button gold" onClick={() => void refresh()}>
              Volver a cargar
            </button>
            <Link href="/acceso" className="button">
              Iniciar sesión
            </Link>
          </div>
        ) : (
          <div className="calendar-wrap">
            <div className="calendar-grid">
              <span />
              {[1, 2, 3, 4].map((c) => (
                <div className="court-head" key={c}>
                  CANCHA {c}
                </div>
              ))}
              {slots.map((start) => (
                <SlotRow
                  key={start}
                  start={start}
                  day={day}
                  bookings={bookings}
                  disabled={!data || busy || loading}
                  onClick={open}
                />
              ))}
            </div>
          </div>
        )}
        <p className="muted" style={{ marginTop: 22 }}>
          Zona horaria: Argentina. Turnos de 90 minutos, de 08:00 a 23:00.
          Configuración de ejemplo para validar con el club.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Reservas · {dateLabel(day)}</h2>
          <CalendarDays size={20} />
        </div>
        {played.map((b) => (
          <div className="list-row" key={b.id}>
            <div>
              <strong>{b.name}</strong>
              <br />
              <small>
                Cancha {b.court} · {timeLabel(b.start)} a{" "}
                {timeLabel(b.start + 90)}
                {b.phone ? " · " + b.phone : ""}
              </small>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong>{money(b.amount - b.deposit)} pendiente</strong>
              <br />
              <button
                className="text-link"
                onClick={() => {
                  setError("");
                  setDetail(b);
                }}
              >
                Ver reserva <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        ))}
        {!played.length && (
          <div className="empty">No hay reservas para este día.</div>
        )}
      </section>
      <section className="panel">
        <h2>Cancelaciones · {dateLabel(day)}</h2>
        {data?.bookings
          .filter((b) => b.day === day && b.status === "cancelled")
          .map((b) => (
            <div className="list-row" key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <p className="muted">
                  Cancha {b.court} · {timeLabel(b.start)} · Cancelada
                </p>
                <p className="muted">
                  Pagado registrado: {money(b.deposit)}. La devolución se
                  coordina por separado.
                </p>
              </div>
            </div>
          ))}
        {!data?.bookings.some(
          (b) => b.day === day && b.status === "cancelled",
        ) && (
          <p className="muted" style={{ marginTop: 16 }}>
            No hay cancelaciones en esta fecha.
          </p>
        )}
      </section>
      <FormModal
        open={!!slot}
        onClose={() => {
          if (!busy) setSlot(null);
        }}
        title={
          slot
            ? `Cancha ${slot.court} · ${timeLabel(slot.start)}`
            : "Nueva reserva"
        }
        description={`${dateLabel(day)} · Turno de 90 minutos. Podés reservar, repetir semanalmente o bloquear la cancha.`}
      >
        <ErrorNotice error={error} />
        {slot && (
          <BookingForm
            day={day}
            court={slot.court}
            start={slot.start}
            busy={busy}
            submit={save}
          />
        )}
      </FormModal>
      <FormModal
        open={!!detail}
        onClose={() => {
          if (!busy) setDetail(null);
        }}
        title={
          detail?.kind === "block"
            ? "Horario bloqueado"
            : "Detalle de la reserva"
        }
        description={
          detail
            ? `Cancha ${detail.court} · ${dateLabel(detail.day)} · ${timeLabel(detail.start)}`
            : ""
        }
      >
        <ErrorNotice error={error} />
        {detail && (
          <>
            <h3>{detail.name}</h3>
            <p>{detail.phone || "Sin teléfono registrado"}</p>
            <div className="notice" style={{ margin: 0 }}>
              Total: {money(detail.amount)}
              <br />
              Pagado: {money(detail.deposit)}
              <br />
              Pendiente: {money(detail.amount - detail.deposit)}
            </div>
            <BookingPaymentHistory bookingId={detail.id} />
            {detail.status === "confirmed" &&
              detail.kind === "booking" &&
              detail.deposit < detail.amount && (
                <form
                  style={{ marginTop: 20 }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await mutate({
                        action: "settleBooking",
                        id: detail.id,
                        expectedDeposit: detail.deposit,
                        method,
                      });
                      setDetail(null);
                      setNotice("Saldo registrado. La reserva quedó pagada.");
                    } catch {}
                  }}
                >
                  <Field label="Medio de pago del saldo">
                    <SelectField value={method} onChange={setMethod}>
                      {["Efectivo", "Transferencia", "Tarjeta"].map((m) => (
                        <Option key={m}>{m}</Option>
                      ))}
                    </SelectField>
                  </Field>
                  <p className="muted" style={{ marginTop: 12 }}>
                    Confirmá únicamente si ya recibiste{" "}
                    {money(detail.amount - detail.deposit)}. Esta acción
                    registra el cobro; no mueve dinero.
                  </p>
                  <div className="form-actions">
                    <SaveButton busy={busy}>
                      Registrar saldo recibido
                    </SaveButton>
                  </div>
                </form>
              )}
            <p className="muted">
              Cancelar libera este turno. Los otros turnos de una serie semanal
              se conservan. Si hubo una seña, coordiná su devolución por
              separado.
            </p>
            <div className="form-actions">
              <button
                className="button small"
                disabled={busy}
                onClick={() => setDetail(null)}
              >
                Volver
              </button>
              <button
                className="button small"
                disabled={busy || detail.status === "cancelled"}
                onClick={async () => {
                  try {
                    await mutate({ action: "cancelBooking", id: detail.id });
                    setDetail(null);
                    setNotice(
                      "Turno cancelado. El horario volvió a quedar libre.",
                    );
                  } catch {}
                }}
              >
                {busy ? "Cancelando…" : "Confirmar cancelación"}
              </button>
            </div>
          </>
        )}
      </FormModal>
    </main>
  );
}
function SlotRow({
  start,
  day,
  bookings,
  disabled,
  onClick,
}: {
  start: number;
  day: string;
  bookings: Booking[];
  disabled: boolean;
  onClick: (c: number, s: number) => void;
}) {
  return (
    <>
      <div className="time-label">{timeLabel(start)}</div>
      {[1, 2, 3, 4].map((c) => {
        const b = bookings.find((b) => b.court === c && b.start === start);
        return (
          <button
            key={c}
            disabled={disabled || (!b && slotPassed(day, start))}
            className={
              "slot " + (b ? (b.kind === "block" ? "blocked" : "booked") : "")
            }
            aria-label={`Cancha ${c}, ${timeLabel(start)}, ${b ? b.name : slotPassed(day, start) ? "horario pasado" : "disponible"}`}
            onClick={() => onClick(c, start)}
          >
            {b ? (
              <>
                <strong>{b.name}</strong>
                <small>
                  {b.kind === "block"
                    ? "No disponible"
                    : b.deposit === b.amount
                      ? "Pagado"
                      : b.deposit
                        ? "Con seña"
                        : "Sin seña"}
                </small>
              </>
            ) : (
              <>
                <Plus size={14} />
                <span>
                  {slotPassed(day, start) ? "Finalizado" : "Reservar"}
                </span>
              </>
            )}
          </button>
        );
      })}
    </>
  );
}
function BookingForm({
  day,
  court,
  start,
  busy,
  submit,
}: {
  day: string;
  court: number;
  start: number;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [kind, setKind] = useState("booking"),
    [amount, setAmount] = useState(""),
    [tariffLoaded, setTariffLoaded] = useState(false),
    [tariffError, setTariffError] = useState(""),
    [deposit, setDeposit] = useState("0"),
    [depositMethod, setDepositMethod] = useState("Efectivo"),
    [weeks, setWeeks] = useState("1"),
    [requestKey] = useState(() => requestId());
  useEffect(() => {
    let active = true;
    void apiFetch("/api/tariffs")
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "No pudimos cargar la tarifa. Cerrá y volvé a abrir la reserva.",
          );
        const data = (await r.json()) as { padel: { padel_price: number } };
        if (active) {
          setAmount(String(data.padel.padel_price));
          setTariffLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setTariffError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!tariffLoaded && kind === "booking") return;
        submit({
          action: "booking",
          day,
          court,
          start,
          name,
          phone,
          kind,
          amount: kind === "block" ? 0 : Number(amount),
          deposit: kind === "block" ? 0 : Number(deposit),
          depositMethod,
          weeks: Number(weeks),
          requestKey,
        });
      }}
    >
      {tariffError && (
        <p role="alert" className="error-box">
          {tariffError}
        </p>
      )}
      <div className="form-grid">
        <Field label="Tipo" full>
          <SelectField value={kind} onChange={setKind}>
            <Option value="booking">Reserva de cancha</Option>
            <Option value="block">Bloqueo por mantenimiento / evento</Option>
          </SelectField>
        </Field>
        <Field
          label={
            kind === "block"
              ? "Motivo del bloqueo"
              : "Nombre del jugador o grupo"
          }
          full
        >
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {kind === "booking" && (
          <>
            <Field label="Teléfono (opcional)" full>
              <input
                type="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Total por turno (ARS)">
              <input
                type="number"
                required
                min="0"
                max="10000000"
                step="1"
                disabled={!tariffLoaded}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Seña del primer turno (ARS)">
              <input
                type="number"
                required
                min="0"
                max={amount}
                step="1"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </Field>
            {Number(deposit) > 0 && (
              <Field label="Medio de pago de la seña" full>
                <SelectField value={depositMethod} onChange={setDepositMethod}>
                  <Option value="Efectivo">Efectivo</Option>
                  <Option value="Transferencia">Transferencia</Option>
                  <Option value="Tarjeta">Tarjeta</Option>
                </SelectField>
              </Field>
            )}
          </>
        )}
        <Field label="Repetición" full>
          <SelectField value={weeks} onChange={setWeeks}>
            <Option value="1">Sólo este turno</Option>
            <Option value="4">Turno fijo · 4 semanas</Option>
            <Option value="8">Turno fijo · 8 semanas</Option>
            <Option value="12">Turno fijo · 12 semanas</Option>
          </SelectField>
        </Field>
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        Si algún turno de la serie está ocupado, no se crea ninguna reserva. La
        seña sólo se registra en el primer turno.
      </p>
      <div className="form-actions">
        <SaveButton busy={busy || (!tariffLoaded && kind === "booking")}>
          {kind === "block" ? "Bloquear horario" : "Confirmar reserva"}
        </SaveButton>
      </div>
    </form>
  );
}
