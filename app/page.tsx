import Link from "next/link";
import { WaveMarquee } from "@/components/wave-marquee";
import { BrandIcon } from "@/components/brand-icon";
import { BenefitsCarousel } from "@/components/benefits-carousel";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Plus,
  Dumbbell,
  Activity,
  Trophy,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { brand, venues } from "@/lib/content";
export default function Home() {
  return (
    <div className="marketing">
      <SiteHeader />
      <main id="contenido">
        <section className="gg-hero">
          <div className="gg-hero-copy">
            <p className="gg-kicker">
              <span /> MERCEDES, BUENOS AIRES
            </p>
            <h1>
              HACÉ
              <br />
              LUGAR
              <br />
              PARA <span>VOS.</span>
            </h1>
            <p className="gg-lead">
              Más fuerza. Más movimiento. Más encuentros.
              <br />
              Encontrá tu forma de entrenar en Gold Gym.
            </p>
            <div className="gg-actions">
              <a
                className="gg-button"
                href={brand.contact}
                target="_blank"
                rel="noopener noreferrer"
              >
                Quiero empezar <ArrowUpRight size={20} />
              </a>
              <a className="gg-text-link" href="#actividades">
                Encontrá tu actividad <ArrowRight size={18} />
              </a>
            </div>
            <div className="gg-hero-note">
              <span>01 — EL PRIMER PASO ES TUYO</span>
              <span>GOLD GYM / MERCEDES</span>
            </div>
          </div>
          <div className="gg-hero-art">
            <div className="gg-photo-main">
              <img
                src="/images/gym.webp"
                width={320}
                height={426}
                alt="Máquinas y pesas de Gold Gym en Mercedes"
                fetchPriority="high"
              />
              <span className="gg-photo-tag">TU LUGAR PARA ENTRENAR</span>
            </div>
            <div className="gg-photo-small">
              <img
                src="/images/padel.webp"
                width={512}
                height={640}
                alt="Un partido en las canchas de Club Unión"
              />
              <span>
                Y PARA ENCONTRARTE. <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="gg-roundel" aria-hidden="true">
              GOLD
              <br />
              <b>CLUB.</b>
              <Plus size={26} />
            </div>
            <div className="gg-art-caption">MUSCULACIÓN / PILATES / PÁDEL</div>
          </div>
        </section>
        <WaveMarquee
          items={[
            { text: "ENTRENÁ", icon: <Dumbbell size={24} /> },
            { text: "CONECTÁ", icon: <Activity size={24} /> },
            { text: "JUGÁ", icon: <Trophy size={24} /> },
          ]}
        />
        <section className="gg-section gg-activities" id="actividades">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">01 / ENCONTRÁ LO TUYO</p>
              <h2>
                CADA UNO A SU RITMO.
                <br />
                <span>TODOS EN MOVIMIENTO.</span>
              </h2>
            </div>
            <p>
              Arrancar de cero, volver o ir por más.
              <br />
              Hay un lugar para vos.
            </p>
          </div>
          <div className="gg-activity-grid">
            <article data-reveal data-reveal-delay="0" className="gg-activity">
              <div className="gg-activity-image">
                <img
                  src="/images/gym-detail.webp"
                  width={300}
                  height={400}
                  alt="Equipamiento de musculación de Gold Gym"
                  loading="lazy"
                />
                <span>01 / FUERZA</span>
              </div>
              <div className="gg-activity-body">
                <h3>MUSCULACIÓN</h3>
                <p>
                  Hacé espacio para tus objetivos. Conocé nuestras salas y
                  consultá el plan para empezar.
                </p>
                <a
                  href={brand.contact}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Consultar planes <ArrowUpRight />
                </a>
              </div>
            </article>
            <article
              data-reveal
              data-reveal-delay="1"
              className="gg-activity gg-activity-pilates"
            >
              <div className="gg-activity-image">
                <img
                  src="/images/pilates/reformer-clase.webp"
                  width={800}
                  height={800}
                  alt="Clase de reformer en Gold Pilates"
                  loading="lazy"
                />
                <span>02 / EQUILIBRIO</span>
              </div>
              <div className="gg-activity-body">
                <h3>PILATES</h3>
                <p>
                  Un espacio para dedicarte tiempo, trabajar tu movilidad y
                  conectar con tu cuerpo.
                </p>
                <Link href="/pilates">
                  Conocer el estudio <ArrowUpRight />
                </Link>
              </div>
            </article>
            <article data-reveal data-reveal-delay="2" className="gg-activity">
              <div className="gg-activity-image">
                <img
                  src="/images/padel.webp"
                  width={512}
                  height={640}
                  alt="Jugadores de pádel en Club Unión"
                  loading="lazy"
                />
                <span>03 / ENCUENTRO</span>
              </div>
              <div className="gg-activity-body">
                <h3>PÁDEL</h3>
                <p>
                  Armá el equipo, elegí un día y coordiná tu turno con la
                  recepción de Club Unión.
                </p>
                <Link href="/padel">
                  Conocer las canchas <ArrowUpRight />
                </Link>
              </div>
            </article>
          </div>
        </section>
        <section className="gg-club-band">
          <div data-reveal>
            <p className="gg-kicker">ASÍ DE SIMPLE</p>
            <h2>
              VENÍ A ENTRENAR.
              <br />
              DEL RESTO,
              <br />
              <span>NOS OCUPAMOS.</span>
            </h2>
          </div>
          <div className="gg-steps">
            {[
              [
                "01",
                "Te anotás en recepción",
                "Llevá tu DNI. El equipo te ayuda con el alta, el plan y tus consultas.",
              ],
              [
                "02",
                "Ingresás con tu documento",
                "Una vez registrado, usás tu DNI en la terminal del club.",
              ],
              [
                "03",
                "Seguís con lo tuyo",
                "La terminal te avisa cuando se acerca el vencimiento de tu cuota.",
              ],
            ].map(([n, t, d]) => (
              <div key={n} data-reveal data-reveal-delay={Number(n) - 1}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
            <Link href="/club" className="gg-text-link">
              Cómo funciona el club <ArrowRight size={18} />
            </Link>
          </div>
        </section>
        <section className="gg-section" id="sedes">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">02 / CERCA TUYO</p>
              <h2>
                TU LUGAR.
                <br />
                <span>EN MERCEDES.</span>
              </h2>
            </div>
            <p>
              Cuatro sedes. Una misma energía.
              <br />
              Elegí dónde querés empezar.
            </p>
          </div>
          <div className="gg-venues">
            {venues.map((v, i) => (
              <article
                className="gg-venue"
                key={v.name}
                data-reveal
                data-reveal-delay={Math.min(i, 3)}
              >
                <span className="gg-venue-number">0{i + 1}</span>
                <div>
                  <small>{v.category}</small>
                  <h3>{v.name}</h3>
                </div>
                <p>
                  <MapPin size={16} />
                  {v.address}
                </p>
                <a
                  href={v.map}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${v.name}: cómo llegar`}
                >
                  Cómo llegar
                  <ArrowUpRight size={22} />
                </a>
              </article>
            ))}
          </div>
          <p className="gg-footnote">
            Consultá los horarios y la disponibilidad de cada actividad antes de
            tu primera visita.
          </p>
        </section>
        <section className="gg-section gg-benefits" id="beneficios">
          <div className="gg-section-head" data-reveal>
            <div>
              <p className="gg-kicker">03 / SER PARTE TIENE SUS BENEFICIOS</p>
              <h2>
                GOLD TE ACOMPAÑA.
                <br />
                <span>TAMBIÉN AFUERA.</span>
              </h2>
            </div>
            <p>
              Descuentos para socios
              <br />
              en comercios de Mercedes.
            </p>
          </div>
          <div data-reveal data-reveal-delay="1">
            <BenefitsCarousel />
          </div>
          <p className="gg-footnote">
            Consultá las condiciones y la vigencia en cada comercio.
          </p>
        </section>
        <section className="gg-faq gg-section">
          <div data-reveal>
            <p className="gg-kicker">ANTES DE VENIR</p>
            <h2>
              MENOS DUDAS.
              <br />
              <span>MÁS GANAS.</span>
            </h2>
          </div>
          <div>
            {[
              [
                "¿Necesito crear una cuenta?",
                "No. Si sos socio, recepción registra tus datos y después ingresás al club con tu DNI. Las cuentas del sistema son solo para el personal.",
              ],
              [
                "¿Cómo consulto planes y horarios?",
                "Escribinos por WhatsApp o acercate a la sede. El equipo te informa los planes, los horarios y la disponibilidad actual.",
              ],
              [
                "¿Cómo reservo una cancha de pádel?",
                "Coordiná el día y el horario con recepción. Ellos registran tu turno y te confirman los detalles. No necesitás una cuenta.",
              ],
            ].map(([q, a]) => (
              <details key={q} data-reveal>
                <summary>
                  {q}
                  <Plus size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="gg-final">
          <p className="gg-kicker" data-reveal>
            EL MOMENTO ES AHORA
          </p>
          <h2 data-reveal data-reveal-delay="1">
            NOS VEMOS
            <br />
            EN <span>GOLD.</span>
          </h2>
          <a
            className="gg-button gg-button-dark"
            data-reveal
            data-reveal-delay="2"
            href={brand.contact}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon name="whatsapp" /> Hablemos por WhatsApp <ArrowUpRight />
          </a>
          <p>Contanos qué te gustaría hacer. Te ayudamos a empezar.</p>
        </section>
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
