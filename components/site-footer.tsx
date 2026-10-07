import Link from "next/link";
import { BrandIcon } from "@/components/brand-icon";
import { ArrowUpRight } from "lucide-react";
import { brand } from "@/lib/content";
export function SiteFooter() {
  return (
    <footer className="gg-footer">
      <div className="gg-footer-main">
        <Link className="gg-brand" href="/">
          <img src="/images/logo.webp" alt="" width={64} height={64} />
          <span>
            GOLD GYM<small>MERCEDES, BUENOS AIRES</small>
          </span>
        </Link>
        <p>
          Tu lugar para entrenar.
          <br />
          Tu club para encontrarte.
        </p>
        <nav className="gg-footer-social" aria-label="Redes y contacto">
          <a
            aria-label="Instagram de Gold Gym"
            href={brand.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon name="instagram" /> Gold Gym <ArrowUpRight size={15} />
          </a>
          <a
            aria-label="Instagram de Gold Pádel"
            href={brand.padel}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon name="instagram" /> Gold Pádel <ArrowUpRight size={15} />
          </a>
          <a
            aria-label="Contactar a Gold Gym por WhatsApp"
            href={brand.contact}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon name="whatsapp" /> WhatsApp <ArrowUpRight size={15} />
          </a>
        </nav>
      </div>
      <div className="gg-footer-bottom">
        <span>Musculación · Pilates · Pádel</span>
        <Link href="/acceso">
          Acceso del personal <ArrowUpRight size={14} />
        </Link>
        <span>Diseño y desarrollo por Nodra Studio</span>
      </div>
    </footer>
  );
}
