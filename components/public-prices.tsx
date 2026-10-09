"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/club";
import { brand } from "@/lib/content";
type Prices = {
  plans: {
    id: string;
    name: string;
    price: number;
    days: number;
    access_scope: string;
  }[];
  padel: { padel_price: number; deposit_percent: number } | null;
};
export default function PublicPrices({
  section = "all",
}: {
  section?: "all" | "gym" | "pilates" | "padel";
}) {
  const [data, setData] = useState<Prices | null>(null);
  useEffect(() => {
    const c = new AbortController();
    const load = () => {
      void fetch("/api/public-prices", { signal: c.signal, cache: "no-store" })
        .then(async (r) => {
          if (r.ok && !c.signal.aborted) setData((await r.json()) as Prices);
        })
        .catch(() => {});
    };
    load();
    const visible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(visible, 60000);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (!data) return null;
  const plans = data.plans.filter(
      (p) =>
        section === "all" ||
        (section !== "padel" &&
          (p.access_scope === section || p.access_scope === "all")),
    ),
    padel = (section === "all" || section === "padel") && data.padel;
  if (!plans.length && !padel) return null;
  return (
    <section className="public-prices" aria-label="Tarifas vigentes">
      <p className="gg-kicker">ELEGÍ CÓMO ENTRENAR</p>
      <h2>Planes y tarifas.</h2>
      <div className="public-price-grid">
        {plans.map((p) => (
          <article key={p.id}>
            <h3>{p.name}</h3>
            <strong>{money(p.price)}</strong>
            <p>
              Por {p.days} días ·{" "}
              {p.access_scope === "pilates"
                ? "Pilates"
                : p.access_scope === "all"
                  ? "Gimnasios y Pilates"
                  : "Gimnasios"}
            </p>
            <a
              className="gg-text-link"
              href={brand.contact}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar inscripción ↗
            </a>
          </article>
        ))}
        {padel && (
          <article>
            <h3>Cancha de pádel</h3>
            <strong>{money(padel.padel_price)}</strong>
            <p>Por cancha · 90 minutos</p>
            {padel.deposit_percent > 0 && (
              <p>
                Seña:{" "}
                {money(
                  Math.round((padel.padel_price * padel.deposit_percent) / 100),
                )}
              </p>
            )}
            <Link className="gg-text-link" href="/turnos">
              Ver horarios y reservar ↗
            </Link>
          </article>
        )}
      </div>
    </section>
  );
}
