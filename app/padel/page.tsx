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
              SALE
              <br />
              <span>PARTIDO?</span>
            </h1>
            <p className="gg-lead">
              Traé la paleta. Juntá a tu equipo.
              <br />
              Nos vemos en la cancha.
            </p>
            <a
              href={brand.contact}
              target="_blank"
              rel="noopener noreferrer"
              className="gg-button"
            >
              Coordinar un turno <ArrowUpRight size={20} />
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
              <p className="gg-kicker">MÁS QUE UN TURNO</p>
              <h2>
                TU PRÓXIMO
                <br />
                <span>PUNTO DE ENCUENTRO.</span>
              </h2>
            </div>
            <p>
              Un club para jugar,
              <br />
              competir y compartir.
            </p>
          </div>
          <div className="gg-feature-grid">
            {[
              [
                "01",
                "Cuatro canchas",
                "Canchas con sintético y blindex para armar tu próximo partido.",
              ],
              [
                "02",
                "Quedate un rato más",
                "Buffet Lo de Bauti para compartir algo después de jugar.",
              ],
              [
                "03",
                "Todo a mano",
                "Vestuarios y duchas para que sigas con tu día.",
              ],
              [
                "04",
                "Jugamos en comunidad",
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
            <a
              className="gg-text-link"
              href={brand.buffet}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Utensils size={18} />
              Menú del buffet <ArrowUpRight size={16} />
            </a>
            <a
              className="gg-text-link"
              href={brand.padel}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="gg-instagram-icon" aria-hidden="true" />
              Novedades y torneos <ArrowUpRight size={16} />
            </a>
            <a
              className="gg-text-link"
              href={venues[2].map}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={18} />
              Cómo llegar <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <section className="gg-final">
          <p className="gg-kicker" data-reveal>HACETE EL ESPACIO</p>
          <h2 data-reveal data-reveal-delay="1">
            UN TURNO FIJO.
            <br />
            <span>UN BUEN PLAN.</span>
          </h2>
          <a
            href={brand.contact}
            className="gg-button gg-button-dark"
            data-reveal
            data-reveal-delay="2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultar disponibilidad <ArrowUpRight />
          </a>
          <p>
            Recepción registra y confirma tu turno. No necesitás crear una
            cuenta.
          </p>
        </section>
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
