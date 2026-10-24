import PublicPrices from "@/components/public-prices";
import type { Metadata } from "next";
import { ArrowUpRight, MapPin, Utensils } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { brand, venues } from "@/lib/content";
export const metadata: Metadata = { title: "Pádel · Unión Gold Club" };
export default function Padel() {
  return (
    <div className="marketing gg-secondary">
      <SiteHeader />
      <main id="contenido">
        <section className="gg-hero">
          <div>
            <p className="gg-kicker">PÁDEL / CLUB UNIÓN</p>
            <h1>
              PÁDEL
              <br />
              <span>EN UNIÓN</span>
            </h1>
            <p className="gg-lead">
              Cuatro canchas con sintético y blindex.
              <br />
              Consultá horarios y solicitá tu turno.
            </p>
            <a href="/turnos" className="gg-button">
              Ver canchas y horarios <ArrowUpRight size={20} />
            </a>
            <div className="gg-hero-note">
              <span>4 CANCHAS / SINTÉTICO + BLINDEX</span>
              <span>MERCEDES</span>
            </div>
          </div>
          <figure className="gg-single-photo">
            <img
              src="/images/padel.webp"
              alt="Canchas de pádel de Club Unión"
              width={1080}
              height={1350}
              fetchPriority="high"
            />
            <figcaption>CLUB UNIÓN · CALLE 103 Y 28</figcaption>
          </figure>
        </section>
        <section className="gg-section">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">INSTALACIONES</p>
              <h2>
                CANCHAS
                <br />
                <span>Y SERVICIOS</span>
              </h2>
            </div>
            <p>
              Canchas, buffet, vestuarios
              <br />
              y duchas en Club Unión.
            </p>
          </div>
          <div className="gg-feature-grid">
            {[
              [
                "01",
                "Cuatro canchas",
                "Canchas con sintético y blindex en Calle 103 y 28.",
              ],
              [
                "02",
                "Buffet Lo de Bauti",
                "Consultá el menú del buffet desde esta página.",
              ],
              [
                "03",
                "Vestuarios y duchas",
                "Disponibles para quienes vienen a jugar.",
              ],
              [
                "04",
                "Torneos y novedades",
                "Encontrá las novedades, torneos y encuentros en nuestro Instagram.",
              ],
            ].map(([n, t, p]) => (
              <article key={n} data-reveal data-reveal-delay={Number(n) - 1}>
                <small>{n}</small>
                <h3>{t}</h3>
                <p>{p}</p>
              </article>
            ))}
          </div>
          <div className="gg-link-row" data-reveal>
            <a className="gg-text-link" href={brand.buffet}>
              <Utensils size={18} />
              Menú del buffet <ArrowUpRight size={16} />
            </a>
            <a className="gg-text-link" href={brand.padel}>
              <span className="gg-instagram-icon" aria-hidden="true" />
              Novedades y torneos <ArrowUpRight size={16} />
            </a>
            <a className="gg-text-link" href={venues[2].map}>
              <MapPin size={18} />
              Cómo llegar <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <section className="gg-final">
          <p className="gg-kicker" data-reveal>
            TURNOS DE PÁDEL
          </p>
          <h2 data-reveal data-reveal-delay="1">
            HORARIOS
            <br />
            <span>Y RESERVAS</span>
          </h2>
          <a
            href="/turnos"
            className="gg-button gg-button-dark"
            data-reveal
            data-reveal-delay="2"
          >
            Ver canchas y horarios <ArrowUpRight />
          </a>
          <p>
            Enviá tu solicitud y esperá la confirmación de recepción.
            No necesitás crear una cuenta.
          </p>
        </section>
        <PublicPrices section="padel" />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
