import Link from "next/link";
import {
  ArrowRight, 
  ArrowUpRight, 
  MapPin, 
  MoveUpRight, 
  MessageCircle,
  Dumbbell,
  Activity,
  Trophy,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { WaveMarquee } from "@/components/wave-marquee";
import { brand, venues } from "@/lib/content";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> MERCEDES, BUENOS AIRES
            </p>
            <h1>
              HACÉ LUGAR
              <br />
              PARA <em>VOS.</em>
            </h1>
            <p className="hero-description">
              Para arrancar. Para seguir. Para dar un poco más.
              <br />
              Encontrá tu forma de entrenar en Gold Gym.
            </p>
            <div className="hero-actions">
              <a
                className="button gold"
                href={brand.contact}
                target="_blank"
                rel="noopener noreferrer"
              >
                Quiero empezar <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="#sedes">
                Conocé las sedes <ArrowRight size={18} />
              </a>
            </div>
            <div className="hero-foot">
              <span>MUSCULACIÓN</span>
              <span>PILATES</span>
              <span>PÁDEL</span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/gym.webp"
              alt="Sala de entrenamiento de Gold Gym en calle 30, con máquinas y pesas"
              width="450"
              height="600"
              fetchPriority="high"
            />
            <div className="hero-vertical">GOLD GYM / MERCEDES</div>
            <div className="image-caption">
              <span>EL PRIMER PASO ES TUYO.</span>
              <ArrowUpRight />
            </div>
          </div>
        </section>
        <WaveMarquee
          items={[
            { text: "ENTRENÁ", icon: <Dumbbell size={24} /> },
            { text: "CONECTÁ", icon: <Activity size={24} /> },
            { text: "COMPETÍ", icon: <Trophy size={24} /> },
            { text: "SUPERATE", icon: <Zap size={24} /> },
          ]}
        />
        <section id="entrena" className="section training">
          <div className="section-heading" data-reveal>
            <div>
              <p className="eyebrow">01 / ENCONTRÁ LO TUYO</p>
              <h2>
                No todos entrenamos igual.
                <br />
                <em>Y está bien.</em>
              </h2>
            </div>
            <p>
              Elegí qué te mueve.
              <br />
              Nosotros te acompañamos.
            </p>
          </div>
          <div className="training-grid">
            <article className="discipline strength" data-reveal>
              <div className="discipline-icon">
                <Dumbbell />
              </div>
              <div>
                <span className="number">01</span>
                <h3>Musculación</h3>
                <p>
                  Entrenamiento libre o personalizado. Un espacio para trabajar
                  en tus objetivos, a tu ritmo.
                </p>
                <a
                  className="text-link"
                  href={brand.contact}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Consultá por tu plan <ArrowUpRight size={18} />
                </a>
              </div>
              <img
                src="/images/gym-detail.webp"
                alt="Equipamiento de la sala de Gold Gym"
                loading="lazy"
                width="300"
                height="400"
              />
            </article>
            <article className="discipline pilates" data-reveal data-reveal-delay="1">
              <img
                src="/images/pilates.webp"
                alt="Estudio de Gold Pilates"
                loading="lazy"
                width="512"
                height="640"
              />
              <div className="discipline-overlay">
                <span className="number">02</span>
                <h3>Pilates</h3>
                <p>Un momento para conectar con tu cuerpo.</p>
                <a
                  className="text-link"
                  href={brand.contact}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Consultá horarios <ArrowUpRight size={18} />
                </a>
              </div>
            </article>
            <Link
              className="discipline padel-card"
              href="/padel"
              data-reveal
              data-reveal-delay="2"
            >
              <img
                src="/images/padel.webp"
                alt="Jugadores en las canchas de Unión Gold Club"
                loading="lazy"
                width="512"
                height="640"
              />
              <div className="discipline-overlay">
                <span className="number">03</span>
                <h3>Pádel</h3>
                <p>El próximo partido se juega acá.</p>
                <span className="text-link">
                  Conocé el club <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          </div>
        </section>
        <section className="club-feature">
          <div className="club-photo" data-reveal="zoom">
            <img
              src="/images/padel.webp"
              alt="Cancha de pádel al aire libre en Unión Gold Club"
              width="512"
              height="640"
              loading="lazy"
            />
          </div>
          <div className="club-copy" data-reveal data-reveal-delay="1">
            <p className="eyebrow">UNIÓN GOLD CLUB</p>
            <h2>
              El partido termina.
              <br />
              <em>El plan sigue.</em>
            </h2>
            <p>
              Una cancha, amigos y algo rico después de jugar. En Unión Gold
              Club también venís a pasarla bien.
            </p>
            <div className="club-facts">
              <span>
                <b>4</b> canchas de pádel
              </span>
              <span>
                Sintético y blindex
                <br />
                Vestuarios y duchas
                <br />
                Buffet Lo de Bauti
              </span>
            </div>
            <Link href="/padel" className="button gold">
              Armá tu próximo partido <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
        <section id="sedes" className="section">
          <div className="section-heading" data-reveal>
            <div>
              <p className="eyebrow">02 / CERCA TUYO</p>
              <h2>
                Tu lugar en <em>Mercedes.</em>
              </h2>
            </div>
            <p>
              Elegí tu sede.
              <br />
              Vení a conocernos.
            </p>
          </div>
          <div className="venue-list">
            {venues.map((v, i) => (
              <a
                key={v.name}
                href={v.map}
                className="venue"
                data-reveal
                data-reveal-delay={Math.min(i + 1, 3)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="venue-index">0{i + 1}</span>
                <div>
                  <small>{v.category}</small>
                  <h3>{v.name}</h3>
                </div>
                <span className="venue-address">
                  <MapPin size={17} />
                  {v.address}
                </span>
                <span className="venue-directions">
                  Cómo llegar <MoveUpRight size={24} />
                </span>
              </a>
            ))}
          </div>
          <p className="muted venue-note" data-reveal>
            Los horarios pueden variar por sede y actividad. Consultanos antes
            de tu primera visita.
          </p>
        </section>
        <section className="closing-cta">
          <p className="eyebrow" data-reveal>EMPEZÁ POR UNA CHARLA</p>
          <h2 data-reveal data-reveal-delay="1">
            El próximo paso
            <br />
            <em>lo damos juntos.</em>
          </h2>
          <a
            className="button gold"
            href={brand.contact}
            target="_blank"
            rel="noopener noreferrer"
            data-reveal
            data-reveal-delay="2"
          >
            Escribinos por WhatsApp <MessageCircle size={20} aria-hidden="true" />
          </a>
        </section>
      </main>
      <SiteFooter />
      <ScrollReveal />
    </>
  );
}
