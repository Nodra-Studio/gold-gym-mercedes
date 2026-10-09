"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CloudRain,
} from "lucide-react";
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
import { brand } from "@/lib/content";
import { BrandIcon } from "./brand-icon";
type Availability = {
  today: string;
  day: string;
  settings: {
    padel_price: number;
    booking_days: number;
    deposit_percent: number;
    payment_alias: string;
    whatsapp: string;
    revision: number;
  };
  occupied: { court: number; start: number }[];
};
type Weather = {
  updatedAt?: string;
  periods: {
    time: string;
    hours: number;
    rain: number;
    temperature?: number;
  }[];
};
export default function PublicPadel() {
  const [day, setDay] = useState(localDay()),
    [data, setData] = useState<Availability | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [slot, setSlot] = useState<{ court: number; start: number } | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(""),
    [paymentMethod, setPaymentMethod] = useState("Transferencia"),
    [quoted, setQuoted] = useState<{ amount: number; deposit: number } | null>(
      null,
    ),
    [copied, setCopied] = useState(false),
    [weather, setWeather] = useState<Weather>({ periods: [] }),
    [refresh, setRefresh] = useState(0);
  const form = useRef<HTMLFormElement>(null),
    sending = useRef(false),
    key = useRef("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setData(null);
    setSlot(null);
    setError("");
    apiFetch("/api/public-padel?day=" + day, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as Availability & { error?: string };
        if (!r.ok) throw Error(j.error);
        if (!c.signal.aborted) setData(j);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [day, refresh]);
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
  const instant = slot
    ? new Date(`${day}T${timeLabel(slot.start)}:00-03:00`).getTime()
    : 0;
  const overlapping = weather.periods.filter((p) => {
    const t = Date.parse(p.time);
    return t < instant + 90 * 60000 && t + p.hours * 3600000 > instant;
  });
  const coverage = overlapping.reduce((end, p) => {
    const start = Date.parse(p.time);
    return start <= end ? Math.max(end, start + p.hours * 3600000) : end;
  }, instant);
  const forecast = coverage >= instant + 90 * 60000 ? overlapping : [];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current || !slot || !data) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const values = new FormData(e.currentTarget),
        file = values.get("receipt") as File;
      let receipt = "",
        receiptType = "";
      if (file?.size) {
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
            name: values.get("name"),
            phone: String(values.get("phone")).replace(/[\s()-]/g, ""),
            expectedPrice: data.settings.padel_price,
            expectedRevision: data.settings.revision,
            paymentMethod,
            requestKey: key.current,
            receipt,
            receiptType,
            website: values.get("website") || "",
          }),
        }),
        j = (await r.json()) as {
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
      <section className="padel-success" role="status">
        <CheckCircle2 size={52} />
        <h2>Solicitud enviada.</h2>
        <p>
          Cancha {slot?.court} · {dateLabel(day)} ·{" "}
          {slot && timeLabel(slot.start)}
        </p>
        <p>
          <strong>Todavía no está confirmado el turno.</strong> Recepción
          revisará la disponibilidad y la seña, y te contactará al teléfono que
          dejaste. No vayas a la cancha sin esa confirmación.
        </p>
        <p>
          Se abrirá el mensaje con los datos del turno. Si pagás por
          transferencia, adjuntá el comprobante en ese chat. El mensaje no se
          envía automáticamente.
        </p>
        <p>
          Precio: {quoted?.amount ? money(quoted.amount) : "A confirmar"}
          {quoted?.deposit ? ` · Seña: ${money(quoted.deposit)}` : ""}
        </p>
        <button
          className="gg-text-link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Datos copiados" : "Copiar datos del turno"}
        </button>
        <small>Referencia: {done.slice(0, 8).toUpperCase()}</small>
        <a
          className="gg-button"
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BrandIcon name="whatsapp" />
          Enviar turno por WhatsApp
        </a>
        <button
          className="gg-text-link"
          onClick={() => {
            setDone("");
            key.current = "";
            setRefresh((n) => n + 1);
          }}
        >
          Ver otros horarios
        </button>
      </section>
    );
  return (
    <section className="public-padel">
      <div className="booking-heading">
        <div>
          <p className="gg-kicker">CANCHAS / CLUB UNIÓN</p>
          <h1>Elegí tu próximo partido.</h1>
          <p>Turnos de 90 minutos. Sin crear una cuenta.</p>
        </div>
        <label>
          <CalendarDays size={18} /> Fecha
          <input
            aria-label="Fecha del partido"
            type="date"
            value={day}
            min={localDay()}
            max={addDays(
              data?.today ?? localDay(),
              data?.settings.booking_days ?? 30,
            )}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) {
                setDay(e.target.value);
                key.current = "";
              }
            }}
          />
        </label>
      </div>
      {error && (
        <div className="booking-error" role="alert">
          {error}
          {!data && (
            <button onClick={() => setRefresh((n) => n + 1)}>
              Volver a intentar
            </button>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">Buscando horarios…</p>
      ) : (
        data && (
          <>
            <div className="booking-summary">
              <strong>
                {data.settings.padel_price
                  ? `${money(data.settings.padel_price)} por cancha`
                  : "Tarifa a confirmar con recepción"}
              </strong>
              <span>{dateLabel(day)} · Horarios de Argentina</span>
              <button onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
                Actualizar disponibilidad
              </button>
            </div>
            <div className="public-courts">
              {[1, 2, 3, 4].map((court) => (
                <section key={court}>
                  <h2>Cancha {court}</h2>
                  <div className="public-slots">
                    {slots.map((start) => {
                      const occupied = data.occupied.some(
                          (o) => o.court === court && o.start === start,
                        ),
                        passed = slotPassed(day, start),
                        selected =
                          slot?.court === court && slot.start === start;
                      return (
                        <button
                          key={start}
                          disabled={busy || occupied || passed}
                          aria-pressed={selected}
                          onClick={() => {
                            setSlot({ court, start });
                            key.current = "";
                            setError("");
                            setTimeout(
                              () =>
                                form.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                }),
                              0,
                            );
                          }}
                        >
                          {timeLabel(start)}
                          <small>
                            {passed
                              ? "Finalizado"
                              : occupied
                                ? "Ocupado"
                                : selected
                                  ? "Elegido"
                                  : "Disponible"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="booking-note">
              La disponibilidad puede cambiar. La solicitud no bloquea la
              cancha: recepción confirma el turno después de revisar los datos y
              la seña.
            </p>
          </>
        )
      )}
      {slot && data && (
        <form className="booking-form" ref={form} onSubmit={submit}>
          <div>
            <p className="gg-kicker">TU ELECCIÓN</p>
            <h2>
              Cancha {slot.court} · {timeLabel(slot.start)}
            </h2>
            <p>
              {dateLabel(day)} ·{" "}
              {data.settings.padel_price
                ? money(data.settings.padel_price)
                : "Tarifa a confirmar"}{" "}
              · 90 minutos
            </p>
            <aside className="booking-weather">
              <CloudRain size={22} />
              <div>
                <strong>Clima previsto en Mercedes</strong>
                {forecast.length ? (
                  <>
                    <p>
                      {forecast.some((p) => p.rain > 0)
                        ? "Se prevén precipitaciones en la franja del turno."
                        : "Sin lluvia prevista en la franja del turno."}
                    </p>
                    {forecast.map((p) => (
                      <small key={p.time}>
                        {new Date(p.time).toLocaleTimeString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · próximas {p.hours} h: {p.rain} mm
                        {Number.isFinite(p.temperature)
                          ? ` · ${Math.round(p.temperature!)} °C`
                          : ""}
                        <br />
                      </small>
                    ))}
                    <small>
                      Pronóstico orientativo; puede cambiar. Actualizado{" "}
                      {weather.updatedAt &&
                        new Date(weather.updatedAt).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          day: "numeric",
                          month: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      .
                    </small>
                  </>
                ) : (
                  <p>
                    No hay pronóstico disponible para ese horario. Podés seguir
                    con la solicitud.
                  </p>
                )}
                <small>
                  Datos de{" "}
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
                  . Resumen adaptado.
                </small>
              </div>
            </aside>
          </div>
          <fieldset disabled={busy}>
            <legend>Tus datos de contacto</legend>
            <label>
              Nombre y apellido
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label>
              WhatsApp con código de país
              <input
                name="phone"
                type="tel"
                required
                pattern="\+?[0-9 \(\)\-]{8,22}"
                placeholder="5492324123456"
                autoComplete="tel"
              />
            </label>
            <label>
              Medio de pago
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option>Transferencia</option>
                <option>Efectivo</option>
              </select>
            </label>
            {data.settings.deposit_percent > 0 && (
              <p>
                <strong>
                  Seña:{" "}
                  {money(
                    Math.round(
                      (data.settings.padel_price *
                        data.settings.deposit_percent) /
                        100,
                    ),
                  )}
                </strong>{" "}
                ({data.settings.deposit_percent}% del turno).
              </p>
            )}
            {paymentMethod === "Transferencia" &&
              data.settings.payment_alias && (
                <p>
                  Alias / CBU: <strong>{data.settings.payment_alias}</strong>
                </p>
              )}
            <label>
              Comprobante de seña (opcional)
              <input
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
              />
              <small>
                JPG, PNG o PDF, hasta 1 MB. Solo si ya coordinaste la
                transferencia con recepción.
              </small>
            </label>
            <label className="booking-trap" aria-hidden="true">
              Sitio web
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <p>
              Usaremos estos datos para gestionar tu turno. El comprobante solo
              puede verlo el personal del club. Para coordinar la seña,{" "}
              <a href={brand.contact} target="_blank" rel="noopener noreferrer">
                hablá con recepción
              </a>
              .
            </p>
            <button className="gg-button gg-button-dark" type="submit">
              {busy ? "Enviando…" : "Solicitar turno"}
              <ArrowRight size={20} />
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
