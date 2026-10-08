import { BrandIcon } from "@/components/brand-icon";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  BicepsFlexed,
  HeartPulse,
  PersonStanding,
  Wind,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { WaveMarquee } from "@/components/wave-marquee";
import { brand } from "@/lib/content";

export const metadata: Metadata = {
  title: "Pilates · Gold Pilates",
  description:
    "Gold Pilates en Mercedes: clases en reformer, tower y mat para trabajar fuerza, postura y flexibilidad.",
};

const details = [
  {
    image: "detalle-barra",
    title: "La barra",
    text: "Guía cada empuje y te da un punto de apoyo firme.",
    alt: "Manos tomando la barra acolchada del reformer",
  },
  {
    image: "detalle-box",
    title: "El box",
    text: "Suma variantes sentado para trabajar la postura.",
    alt: "Alumna sentada sobre el box del reformer",
  },
  {
    image: "detalle-asiento",
    title: "Las hombreras",
    text: "Estabilidad en cada recorrido del carro.",
    alt: "Carro del reformer con sus hombreras de cuero",
  },
  {
    image: "detalle-correa",
    title: "Las correas",
    text: "Piernas y centro trabajando con control.",
    alt: "Pie apoyado en la correa del reformer",
  },
  {
    image: "detalle-resortes",
    title: "Los resortes",
    text: "Cada color, una resistencia. La clase se adapta a vos.",
    alt: "Resortes de colores del reformer",
  },
];

const gallery = [
  { image: "reformers", alt: "Sala de Gold Pilates con reformers y tower" },
  { image: "accesorios", alt: "Pelotas, aros y accesorios del estudio" },
  { image: "cartel", alt: "Cartel iluminado de Gold Pilates" },
  { image: "recepcion", alt: "Recepción de Gold Pilates" },
  {
    image: "recepcion-logo",
    alt: "Logo de Gold Pilates en la pared de recepción",
  },
];

export default function Pilates() {
  return (
    <div className="marketing gg-secondary gg-pilates-page">
      <SiteHeader />
      <main id="contenido">
        <section className="gg-hero">
          <div className="hero-copy">
            <p className="gg-kicker">
              <span /> GOLD PILATES / MERCEDES
            </p>
            <h1>
              TU CUERPO,
              <br />
              <span>EN EQUILIBRIO.</span>
            </h1>
            <p className="gg-lead">
              Fuerza, postura y respiración en cada movimiento.
              <br />
              Un momento para conectar con vos.
            </p>
            <div className="gg-actions">
              <a
                className="gg-button"
                href={brand.contact}
                target="_blank"
                rel="noopener noreferrer"
              >
                <BrandIcon name="whatsapp" /> Consultá horarios <ArrowUpRight size={19} />
              </a>
              <a className="gg-text-link" href="#estudio">
                Conocé el estudio <ArrowRight size={18} />
              </a>
            </div>
            <div className="gg-hero-note">
              <span>REFORMER</span>
              <span>TOWER</span>
              <span>MAT</span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/pilates/reformer-clase.webp"
              alt="Alumna trabajando con aro sobre un reformer en Gold Pilates"
              width="800"
              height="800"
              fetchPriority="high"
            />
            <img
              className="pilates-badge"
              src="/images/pilates/logo.webp"
              alt=""
              width="256"
              height="256"
            />
            <div className="image-caption">
              <span>CUERPO · MENTE · ESPÍRITU</span>
              <ArrowUpRight />
            </div>
          </div>
        </section>

        <WaveMarquee
          items={[
            { text: "RESPIRÁ", icon: <Wind size={24} /> },
            { text: "FORTALECÉ", icon: <BicepsFlexed size={24} /> },
            { text: "ALINEÁ", icon: <PersonStanding size={24} /> },
            { text: "CONECTÁ", icon: <HeartPulse size={24} /> },
          ]}
        />

        <section className="club-feature pilates-method">
          <div className="club-photo" data-reveal="zoom">
            <img
              src="/images/pilates/definicion.webp"
              alt="Cuadro con la definición de pilates sobre los reformers del estudio"
              width="800"
              height="800"
              loading="lazy"
            />
          </div>
          <div className="club-copy" data-reveal data-reveal-delay="1">
            <p className="gg-kicker">01 / EL MÉTODO</p>
            <h2>
              Cuerpo, mente
              <br />
              <span>y espíritu.</span>
            </h2>
            <p>
              Pilates es la coordinación plena de los tres. Un entrenamiento de
              bajo impacto que fortalece desde el centro, mejora la postura y
              suma flexibilidad, con cada movimiento hecho a conciencia.
            </p>
            <div className="club-facts">
              <span>
                <b>3</b> formas de entrenar
              </span>
              <span>
                Reformer
                <br />
                Tower
                <br />
                Mat y accesorios
              </span>
            </div>
          </div>
        </section>

        <section className="gg-section">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">02 / CADA DETALLE CUENTA</p>
              <h2>
                Precisión
                <br />
                <span>en cada movimiento.</span>
              </h2>
            </div>
            <p>
              Equipos pensados para acompañarte.
              <br />
              Vos ponés las ganas.
            </p>
          </div>
          <div className="pilates-details">
            {details.map((detail, i) => (
              <article
                key={detail.image}
                data-reveal
                data-reveal-delay={Math.min(i, 3)}
              >
                <img
                  src={`/images/pilates/${detail.image}.webp`}
                  alt={detail.alt}
                  loading="lazy"
                  width="480"
                  height="360"
                />
                <small>0{i + 1}</small>
                <h3>{detail.title}</h3>
                <p>{detail.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="estudio" className="gg-section pilates-studio">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">03 / EL ESTUDIO</p>
              <h2>
                Un espacio para
                <br />
                <span>bajar un cambio.</span>
              </h2>
            </div>
            <p>
              Luz cálida, madera y calma.
              <br />
              Entrás y el ritmo cambia.
            </p>
          </div>
          <div className="pilates-gallery">
            {gallery.map((photo, i) => (
              <img
                key={photo.image}
                src={`/images/pilates/${photo.image}.webp`}
                alt={photo.alt}
                loading="lazy"
                width="800"
                height="800"
                data-reveal="zoom"
                data-reveal-delay={Math.min(i, 3)}
              />
            ))}
          </div>
        </section>

        <section className="gg-final">
          <p className="gg-kicker" data-reveal>
            TU PRIMERA CLASE
          </p>
          <h2 data-reveal data-reveal-delay="1">
            Reservá tu lugar.
            <br />
            <span>Nosotros te guiamos.</span>
          </h2>
          <a
            className="gg-button"
            href={brand.contact}
            target="_blank"
            rel="noopener noreferrer"
            data-reveal
            data-reveal-delay="2"
          >
            <BrandIcon name="whatsapp" /> Escribinos por WhatsApp{" "}
            
          </a>
          <p className="muted">Te contamos horarios y planes disponibles.</p>
        </section>
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
