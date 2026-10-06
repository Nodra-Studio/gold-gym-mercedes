import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, CalendarDays, UserRound, Utensils } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { brand, venues } from "@/lib/content";
export const metadata: Metadata = { title: "Pádel · Unión Gold Club" };
export default function Padel() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero padel-hero">
          <div className="hero-copy">
            <p className="eyebrow">UNIÓN GOLD CLUB / MERCEDES</p>
            <h1>
              ¿SALE
              <br />
              <em>PARTIDO?</em>
            </h1>
            <p className="hero-description">
              Traé la paleta. Juntá a tu equipo.
              <br />
              Nos vemos en la cancha.
            </p>
            <div className="hero-actions">
              <Link className="button gold" href={brand.contact}><CalendarDays size={20} aria-hidden="true" /> Reservar por recepción</Link>
              <Link href="/cuenta" className="text-link"><UserRound size={18} aria-hidden="true" /> Mis reservas</Link>
            </div>
            <div className="hero-foot">
              <span>4 CANCHAS</span>
              <span>SINTÉTICO + BLINDEX</span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/padel.webp"
              alt="Partido en una cancha de Unión Gold Club"
              width="1080"
              height="1350"
              fetchPriority="high"
            />
            <div className="image-caption">
              <span>CALLE 103 Y 28 · MERCEDES</span>
              <MapPin />
            </div>
          </div>
        </section>
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MÁS QUE UN TURNO</p>
              <h2>
                Tu próximo
                <br />
                <em>punto de encuentro.</em>
              </h2>
            </div>
            <p>
              Un club para jugar,
              <br />
              competir y compartir.
            </p>
          </div>
          <div className="benefit-grid">
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
                "Torneos y encuentros. Encontrá las novedades en nuestro Instagram.",
              ],
            ].map(([n, h, p]) => (
              <article key={n}>
                <small>{n}</small>
                <h3>{h}</h3>
                <p>{p}</p>
              </article>
            ))}
          </div>
          <div className="link-row">
            <a
              href={brand.buffet}
              className="text-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Utensils size={18} aria-hidden="true" /> Ver menú del buffet
            </a>
            <a
              href={brand.padel}
              className="text-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img className="brand-icon" src="/icons/instagram.svg" alt="" width={18} height={18} /> Novedades y torneos
            </a>
            <a
              href={venues[2].map}
              className="text-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={18} aria-hidden="true" /> Cómo llegar
            </a>
          </div>
        </section>
        <section className="closing-cta">
          <p className="eyebrow">HACETE EL ESPACIO</p>
          <h2>
            Un turno fijo.
            <br />
            <em>Un buen plan.</em>
          </h2>
          <Link href={brand.contact} className="button gold"><CalendarDays size={20} aria-hidden="true" /> Consultar mi próximo turno</Link>
          <p className="muted">Elegí el día y la cancha. Consultá tus reservas desde tu cuenta.</p>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}

