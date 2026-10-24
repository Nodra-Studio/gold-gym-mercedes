import PublicPrices from "@/components/public-prices";
import { BrandIcon } from "@/components/brand-icon";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";
import { brand } from "@/lib/content";
export const metadata = { title: "Cómo sumarte · Gold Gym" };
export default function Club() {
  return (
    <div className="marketing gg-secondary">
      <SiteHeader />
      <main id="contenido">
        <section className="gg-hero">
          <div>
            <p className="gg-kicker">INSCRIPCIÓN / GOLD GYM</p>
            <h1>
              ASOCIATE
              <br />
              <span>A GOLD</span>
            </h1>
            <p className="gg-lead">
              Inscribite en recepción con tu DNI.
              <br />
              Después, usá tu documento para ingresar al gimnasio.
            </p>
            <a
              href={brand.contact}
              className="gg-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BrandIcon name="whatsapp" /> Consultar en recepción <ArrowUpRight size={20} />
            </a>
          </div>
          <div className="gg-document-art">
            <span>GOLD GYM / SOCIOS</span>
            <strong>
              INGRESO
              <br />
              CON DNI
            </strong>
            <p>Consultá tu inscripción, plan y vencimiento en recepción.</p>
          </div>
        </section>
        <section className="gg-club-band">
          <div data-reveal>
            <p className="gg-kicker">INSCRIPCIÓN E INGRESO</p>
            <h2>
              ALTA, INGRESO
              <br />
              <span>Y RENOVACIÓN</span>
            </h2>
          </div>
          <div className="gg-steps">
            {[
              [
                "01",
                "Te registramos",
                "El personal carga tu nombre, DNI, contacto y plan, y registra tus pagos.",
              ],
              [
                "02",
                "Ingresás con tu DNI",
                "En la terminal del club, ingresá tu documento. La pantalla te indica si podés pasar.",
              ],
              [
                "03",
                "Renovás tu plan",
                "Desde 7 días antes del vencimiento, la terminal te avisa que tenés que renovar. Si hay un problema, recepción te ayuda.",
              ],
            ].map(([n, t, p]) => (
              <div key={n} data-reveal data-reveal-delay={Number(n) - 1}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="gg-faq gg-section">
          <div data-reveal>
            <p className="gg-kicker">INFORMACIÓN ÚTIL</p>
            <h2>
              CONSULTAS
              <br />
              <span>FRECUENTES</span>
            </h2>
          </div>
          <div>
            <details data-reveal data-reveal-delay="0" open>
              <summary>
                Clases y reservas de pádel <ArrowUpRight size={20} />
              </summary>
              <p>
                Consultá los horarios y coordiná tu lugar con recepción. El
                personal registra tu reserva y te confirma los detalles.
              </p>
            </details>
            <details data-reveal data-reveal-delay="1">
              <summary>
                ¿Qué pasa si mi cuota está vencida? <ArrowUpRight size={20} />
              </summary>
              <p>
                La terminal te avisa y te indica que pases por recepción para
                regularizar tu cuota antes de ingresar.
              </p>
            </details>
          </div>
        </section>
        <PublicPrices section="gym" />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
