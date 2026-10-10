"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudRain,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import {
  addDays,
  dateLabel,
  localDay,
  money,
  requestId,
  slotPassed,
  slots,
  timeLabel,
} from "@/lib/club";
import { brand, venues } from "@/lib/content";
import { BrandIcon } from "./brand-icon";
import s from "./public-padel.module.css";

type Availability = {
  today: string;
  day: string;
  settings: {
    padel_price: number;
    booking_days: number;
    cancel_hours: number;
    deposit_percent: number;
    payment_alias: string;
    whatsapp: string;
    revision: number;
  };
  occupied: { court: number; start: number }[];
};
type Weather = {
  periods: {
    time: string;
    hours: number;
    rain: number;
    temperature?: number;
  }[];
};
type Choice = { court: number; start: number };
const courtNumbers = [1, 2, 3, 4];
function shortDate(day: string, option: "weekday" | "month") {
  return new Date(day + "T12:00:00-03:00").toLocaleDateString("es-AR", {
    [option]: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function PublicPadel() {
  const [day, setDay] = useState(localDay()),
    [court, setCourt] = useState(1);
  const [data, setData] = useState<Availability | null>(null),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [slot, setSlot] = useState<Choice | null>(null);
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [quoted, setQuoted] = useState<{
    amount: number;
    deposit: number;
  } | null>(null);
  const [copied, setCopied] = useState(false),
    [weather, setWeather] = useState<Weather>({ periods: [] });
  const [refresh, setRefresh] = useState(0),
    [clock, setClock] = useState(Date.now());
  const [name, setName] = useState(""),
    [phone, setPhone] = useState("");
  const sending = useRef(false),
    key = useRef(""),
    heading = useRef<HTMLHeadingElement>(null);
  const paymentMethod = "Transferencia";
  const venue = venues.find((v) => v.name === "Club Unión")!;
  // Revalidate on return from another tab. Keep the customer's entered details.
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible" && !sending.current) {
        setRefresh((n) => n + 1);
        setClock(Date.now());
      }
    };
    const timer = window.setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (done) return;
    const c = new AbortController();
    setLoading(true);
    apiFetch("/api/public-padel?day=" + day, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as Availability & { error?: string };
        if (!r.ok) throw Error(j.error);
        if (!c.signal.aborted) {
          setData(j);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [day, refresh, done]);
  useEffect(() => {
    const c = new AbortController();
    apiFetch("/api/padel-weather", { signal: c.signal })
      .then((r) => r.json() as Promise<Partial<Weather>>)
      .then((j) => {
        if (!c.signal.aborted && Array.isArray(j.periods))
          setWeather(j as Weather);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (review || done) heading.current?.focus();
  }, [review, done]);
  const today = localDay(new Date(clock));
  const maxDay = addDays(
    data?.today ?? today,
    data?.settings.booking_days ?? 30,
  );
  const days = Array.from({ length: 7 }, (_, n) => addDays(day, n)).filter(
    (d) => d <= maxDay,
  );
  const currentData = data?.day === day ? data : null;
  const available = (courtNumber: number, start: number) =>
    !!currentData &&
    !slotPassed(day, start) &&
    !currentData.occupied.some(
      (o) => o.court === courtNumber && o.start === start,
    );
  const availableSlots = slots.filter((start) => available(court, start));
  const validSlot = !!slot && available(slot.court, slot.start);
  const price = currentData?.settings.padel_price ?? 0;
  const deposit = Math.round(
    (price * (currentData?.settings.deposit_percent ?? 0)) / 100,
  );
  const instant = slot
    ? new Date(`${day}T${timeLabel(slot.start)}:00-03:00`).getTime()
    : 0;
  const periods = weather.periods
    .filter(
      (p) =>
        Date.parse(p.time) < instant + 90 * 60000 &&
        Date.parse(p.time) + p.hours * 3600000 > instant,
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const coverage = periods.reduce(
    (end, p) =>
      Date.parse(p.time) <= end
        ? Math.max(end, Date.parse(p.time) + p.hours * 3600000)
        : end,
    instant,
  );
  const forecast = coverage >= instant + 90 * 60000 ? periods : [];
  function chooseDay(value: string) {
    if (!value || value === day) return;
    setDay(value);
    setSlot(null);
    setReview(false);
    setError("");
    key.current = "";
  }
  function chooseSlot(start: number) {
    setSlot({ court, start });
    setError("");
    key.current = "";
  }
  function editChoice() {
    setReview(false);
    setError("");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current || !slot || !currentData || !validSlot || loading)
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const values = new FormData(e.currentTarget),
        file = values.get("receipt") as File;
      let receipt = "",
        receiptType = "";
      if (paymentMethod === "Transferencia" && file?.size) {
        if (
          file.size > 1048576 ||
          !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
        )
          throw Error("Adjuntá un JPG, PNG o PDF de hasta 1 MB.");
        receiptType = file.type;
        receipt = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(Error("No pudimos leer el archivo."));
          reader.readAsDataURL(file);
        });
      }
      if (!key.current) key.current = requestId();
      const r = await apiFetch("/api/public-padel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          ...slot,
          name,
          phone: phone.replace(/[\s()-]/g, ""),
          expectedPrice: price,
          expectedRevision: currentData.settings.revision,
          paymentMethod,
          requestKey: key.current,
          receipt,
          receiptType,
          website: values.get("website") || "",
        }),
      });
      const j = (await r.json()) as {
        error?: string;
        id: string;
        amount: number;
        deposit_expected: number;
      };
      if (!r.ok) throw Error(j.error);
      setQuoted({ amount: j.amount, deposit: j.deposit_expected });
      setDone(j.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos enviar la solicitud.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const message = `Hola! Solicité el turno #${done.slice(0, 8).toUpperCase()}.\nCancha ${slot?.court} · ${day} · ${slot ? timeLabel(slot.start) : ""} · 90 minutos.\nPrecio: ${quoted?.amount ? money(quoted.amount) : "a confirmar"}.\nSeña: ${quoted?.deposit ? money(quoted.deposit) : "a coordinar"}.\nMedio de pago: ${paymentMethod}.\nQuedo a la espera de la confirmación de recepción.`;
  const whatsapp = data?.settings.whatsapp
    ? `https://wa.me/${data.settings.whatsapp}?text=${encodeURIComponent(message)}`
    : brand.contact;
  if (done)
    return (
      <section className={`${s.page} ${s.success}`}>
        <div className={s.successIcon}>
          <CheckCircle2 size={40} aria-hidden="true" />
        </div>
        <p className={s.eyebrow}>
          SOLICITUD RECIBIDA · #{done.slice(0, 8).toUpperCase()}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          Tu próximo partido,
          <br />
          un paso más cerca.
        </h1>
        <p className={s.lead}>
          Recepción debe confirmar tu turno. Todavía no está reservado ni se
          realizó un cobro online.
        </p>
        <div className={s.receipt}>
          <strong>Club Unión · Cancha {slot?.court}</strong>
          <span>
            {dateLabel(day)} · {slot && timeLabel(slot.start)} · 90 min
          </span>
          <span>
            Total {quoted?.amount ? money(quoted.amount) : "a confirmar"}
            {quoted?.deposit ? ` · Seña ${money(quoted.deposit)}` : ""}
          </span>
        </div>
        <p>
          Te contactaremos al WhatsApp que dejaste. También podés escribirnos
          con la referencia de tu solicitud.
        </p>
        <a
          className={s.primary}
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BrandIcon name="whatsapp" />
          Hablar con recepción
          <ArrowRight size={18} />
        </a>
        <button
          className={s.textButton}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
            } catch {
              setError(
                "No pudimos copiar los datos. Podés usar la referencia de arriba.",
              );
            }
          }}
        >
          {copied ? "Datos copiados" : "Copiar datos del turno"}
        </button>
        <small>
          El mensaje de WhatsApp lo enviás vos. El comprobante no se adjunta
          automáticamente.
        </small>
        {error && <p role="alert">{error}</p>}
        <button
          className={s.textButton}
          onClick={() => {
            setDone("");
            setReview(false);
            setSlot(null);
            setCopied(false);
            setError("");
            key.current = "";
            setRefresh((n) => n + 1);
          }}
        >
          Ver otros horarios
        </button>
      </section>
    );
  return (
    <section className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>GOLD GYM / PÁDEL</p>
          <h1 ref={heading} tabIndex={-1}>
            {review ? "Revisá tu turno." : "Nos vemos en la cancha."}
          </h1>
          <p className={s.lead}>
            {review
              ? "Tu partido, tus datos y la seña. Todo en un solo lugar."
              : "Elegí cuándo jugar. Nosotros ponemos la cancha."}
          </p>
        </div>
        <a
          className={s.location}
          href={venue.map}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapPin size={20} />
          <span>
            <strong>Club Unión</strong>
            <small>{venue.address} · Mercedes</small>
          </span>
          <ChevronRight size={16} />
        </a>
      </header>
      <ol className={s.steps} aria-label="Pasos de la reserva">
        <li aria-current={!review ? "step" : undefined}>
          <span>{review ? <Check size={15} /> : "1"}</span>Elegí tu turno
        </li>
        <li aria-current={review ? "step" : undefined}>
          <span>2</span>Datos y seña
        </li>
        <li>
          <span>3</span>Confirmación
        </li>
      </ol>
      {!review ? (
        <div className={s.selection}>
          <div className={s.schedule}>
            <div className={s.sectionHeading}>
              <h2>
                <span>01</span>¿Qué día jugás?
              </h2>
              <label className={s.calendar}>
                <CalendarDays size={17} />
                <input
                  type="date"
                  aria-label="Elegir fecha del partido"
                  value={day}
                  min={today}
                  max={maxDay}
                  disabled={busy}
                  onChange={(e) => chooseDay(e.target.value)}
                />
              </label>
            </div>
            <div className={s.dateStrip} aria-label="Fechas disponibles">
              <button
                className={s.previous}
                aria-label="Día anterior"
                disabled={day <= today}
                onClick={() => chooseDay(addDays(day, -1))}
              >
                <ArrowLeft size={18} />
              </button>
              {days.map((d) => (
                <button
                  key={d}
                  className={s.date}
                  aria-pressed={d === day}
                  onClick={() => chooseDay(d)}
                >
                  <small>{d === today ? "Hoy" : shortDate(d, "weekday")}</small>
                  <strong>{Number(d.slice(-2))}</strong>
                  <small>{shortDate(d, "month")}</small>
                </button>
              ))}
            </div>
            <div className={s.sectionHeading}>
              <h2>
                <span>02</span>Elegí una cancha
              </h2>
              <span className={s.subtle}>90 minutos de juego</span>
            </div>
            <div className={s.courts} aria-label="Canchas">
              {courtNumbers.map((c) => (
                <button
                  key={c}
                  aria-pressed={court === c}
                  onClick={() => {
                    setCourt(c);
                    setSlot(null);
                    setError("");
                    key.current = "";
                  }}
                >
                  <svg viewBox="0 0 40 48" fill="none" aria-hidden="true">
                    <rect x="5" y="3" width="30" height="42" rx="2" />
                    <path d="M5 24h30M5 13h30M5 35h30M20 13v22" />
                  </svg>
                  <span>
                    <small>PÁDEL</small>
                    <strong>Cancha {c}</strong>
                  </span>
                  {court === c && <Check size={18} />}
                </button>
              ))}
            </div>
            <div className={s.sectionHeading}>
              <h2>
                <span>03</span>Horarios libres
              </h2>
              <button
                className={s.refresh}
                disabled={loading}
                onClick={() => {
                  setClock(Date.now());
                  setRefresh((n) => n + 1);
                }}
                aria-label="Actualizar disponibilidad"
              >
                <RefreshCw size={16} className={loading ? s.spinning : ""} />
                <span>Actualizar</span>
              </button>
            </div>
            <p className={s.subtle}>{dateLabel(day)} · Hora de Argentina</p>
            {error && (
              <div className={s.error} role="alert">
                {error}
                <button type="button" onClick={() => setRefresh((n) => n + 1)}>
                  Volver a intentar
                </button>
              </div>
            )}
            <div className={s.slots} aria-busy={loading}>
              {loading && !currentData ? (
                <p className={s.empty} role="status">
                  Buscando horarios disponibles…
                </p>
              ) : (
                currentData &&
                availableSlots.map((start) => (
                  <button
                    key={start}
                    disabled={loading}
                    aria-pressed={slot?.court === court && slot.start === start}
                    onClick={() => chooseSlot(start)}
                  >
                    <strong>{timeLabel(start)}</strong>
                    <small>
                      {slot?.start === start && slot.court === court
                        ? "Seleccionado"
                        : deposit > 0
                          ? "Con seña"
                          : "Disponible"}
                    </small>
                  </button>
                ))
              )}
              {!loading && currentData && !availableSlots.length && (
                <div className={s.empty}>
                  <Clock3 size={28} />
                  <strong>No quedan horarios para esta cancha.</strong>
                  <p>Probá otra cancha o elegí un nuevo día.</p>
                  <button
                    className={s.textButton}
                    disabled={day >= maxDay}
                    onClick={() => chooseDay(addDays(day, 1))}
                  >
                    Ver el día siguiente <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            <p className={s.footnote}>
              Solo mostramos turnos libres. La disponibilidad se vuelve a
              verificar al enviar tu solicitud.
            </p>
          </div>
          <aside className={s.summary} aria-label="Resumen del turno">
            <p className={s.eyebrow}>TU PRÓXIMO PARTIDO</p>
            <h2>{slot ? `Cancha ${slot.court}` : "Armá tu partido."}</h2>
            <p>Club Unión · Gold Gym</p>
            <div className={s.summaryDetails}>
              <span>
                <CalendarDays size={18} />
                {dateLabel(day)}
              </span>
              <span>
                <Clock3 size={18} />
                {slot
                  ? `${timeLabel(slot.start)} a ${timeLabel(slot.start + 90)}`
                  : "Seleccioná un horario"}
              </span>
            </div>
            <div className={s.total}>
              <span>Total por cancha</span>
              <strong>{price ? money(price) : "A confirmar"}</strong>
            </div>
            <p className={s.footnote}>
              {deposit
                ? `Seña ${money(deposit)} · Saldo ${money(price - deposit)} en el club.`
                : "Recepción te indicará cómo confirmar tu turno."}
            </p>
            <button
              className={s.primary}
              disabled={!validSlot || loading}
              onClick={() => setReview(true)}
            >
              Continuar
              <ArrowRight size={19} />
            </button>
            <span className={s.reassurance}>
              <ShieldCheck size={16} />
              Sin crear una cuenta
            </span>
          </aside>
        </div>
      ) : (
        <>
          <button className={s.back} onClick={editChoice} disabled={busy}>
            <ArrowLeft size={18} />
            Cambiar día, cancha u horario
          </button>
          <form className={s.checkout} onSubmit={submit}>
            <div className={s.checkoutMain}>
              <section className={s.panel}>
                <div className={s.sectionHeading}>
                  <h2>Datos del jugador</h2>
                  <span className={s.subtle}>Sin registro</span>
                </div>
                <p className={s.subtle}>
                  Usaremos tu WhatsApp para coordinar el turno.
                </p>
                <fieldset className={s.contacts} disabled={busy}>
                  <label>
                    Nombre y apellido
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    WhatsApp con código de país
                    <input
                      name="phone"
                      type="tel"
                      required
                      pattern="\+?[0-9 \(\)\-]{8,22}"
                      maxLength={22}
                      placeholder="5492324123456"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                </fieldset>
              </section>
              <section className={s.panel}>
                <h2>Seña por transferencia</h2>
                <p className={s.subtle}>
                  Consultá la disponibilidad con recepción antes de transferir.
                  Tu solicitud se confirma cuando el club verifica el turno y el
                  pago.
                </p>
                {paymentMethod === "Transferencia" && (
                  <div className={s.transfer}>
                    {currentData?.settings.payment_alias && (
                      <p>
                        Alias / CBU:{" "}
                        <strong>{currentData.settings.payment_alias}</strong>
                      </p>
                    )}
                    <label>
                      Comprobante de seña <span>(opcional)</span>
                      <input
                        disabled={busy}
                        name="receipt"
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                      />
                      <small>
                        JPG, PNG o PDF de hasta 1 MB. Adjuntalo solo si ya
                        coordinaste y pagaste la transferencia.
                      </small>
                    </label>
                  </div>
                )}
              </section>
              <aside className={s.weather}>
                <CloudRain size={22} />
                <div>
                  <strong>El clima para tu partido</strong>
                  <p>
                    {forecast.length
                      ? forecast.some((p) => p.rain > 0)
                        ? "Se prevén precipitaciones en la franja del turno. Consultá al club antes de jugar."
                        : "Sin lluvia prevista en la franja del turno."
                      : "Todavía no hay pronóstico disponible para ese horario."}
                  </p>
                  <small>
                    Pronóstico orientativo ·{" "}
                    <a
                      href="https://api.met.no/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MET Norway
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CC BY 4.0
                    </a>
                  </small>
                </div>
              </aside>
            </div>
            <aside className={s.order}>
              <div className={s.orderHeader}>
                <p className={s.eyebrow}>RESUMEN DEL TURNO</p>
                <h2>Cancha {slot?.court}</h2>
                <p>Gold Gym · Club Unión</p>
                <div className={s.summaryDetails}>
                  <span>
                    <CalendarDays size={18} />
                    {dateLabel(day)}
                  </span>
                  <span>
                    <Clock3 size={18} />
                    {slot && timeLabel(slot.start)} · 90 minutos
                  </span>
                  <span>
                    <MapPin size={18} />
                    {venue.address}
                  </span>
                </div>
              </div>
              <dl className={s.amounts}>
                <div>
                  <dt>Total del turno</dt>
                  <dd>{price ? money(price) : "A confirmar"}</dd>
                </div>
                <div className={s.deposit}>
                  <dt>Seña para confirmar</dt>
                  <dd>{deposit ? money(deposit) : "A coordinar"}</dd>
                </div>
                {deposit > 0 && (
                  <div>
                    <dt>Saldo en el club</dt>
                    <dd>{money(price - deposit)}</dd>
                  </div>
                )}
              </dl>
              <div className={s.confirmation}>
                <p>
                  La solicitud no bloquea la cancha. Recepción verificará el
                  turno y la seña antes de confirmarlo.
                </p>
                {currentData && !validSlot && (
                  <p className={s.error} role="alert">
                    Este horario ya no está disponible. Elegí otro turno.
                  </p>
                )}
                {error && (
                  <div className={s.error} role="alert">
                    {error}
                    <button
                      type="button"
                      disabled={loading || busy}
                      onClick={() => setRefresh((n) => n + 1)}
                    >
                      Actualizar disponibilidad y precio
                    </button>
                  </div>
                )}
                <label className={s.trap} aria-hidden="true">
                  Sitio web
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
                <button
                  className={s.primary}
                  type="submit"
                  disabled={busy || loading || !validSlot}
                >
                  {busy
                    ? "Enviando solicitud…"
                    : loading
                      ? "Verificando disponibilidad…"
                      : "Solicitar este turno"}
                  {!busy && <ArrowRight size={18} />}
                </button>
                <small>No se realizará ningún cobro al enviar.</small>
              </div>
              <details className={s.policy}>
                <summary>Cancelaciones y seña</summary>
                <p>
                  Para cancelar o cambiar el turno, contactá a recepción.{" "}
                  {currentData?.settings.cancel_hours
                    ? `El plazo configurado por el club es de ${currentData.settings.cancel_hours} horas antes del partido.`
                    : "Consultá al club los plazos de cancelación."}{" "}
                  Los reintegros se coordinan con el club; este sitio todavía no
                  realiza devoluciones automáticas.
                </p>
              </details>
            </aside>
          </form>
        </>
      )}
    </section>
  );
}
