import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { brand } from "@/lib/content";
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <strong>GOLD GYM</strong>
          <p>Más de 3 gimnasios, un centro exclusivo de pilates y canchas de pádel de primer nivel. <br /> Entrená, sumate al movimiento y superá tus objetivos con nosotros.</p>
        </div>
        <nav className="footer-socials" aria-label="Redes y contacto">
          <div><a className="social-icon" href={brand.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Gold Gym" title="Instagram de Gold Gym"><img src="/icons/instagram.svg" alt="" width={22} height={22} /></a><small>Gimnasio</small></div>
          <div><a className="social-icon" href={brand.padel} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Gold Gym Pádel" title="Instagram de Gold Gym Pádel"><img src="/icons/instagram.svg" alt="" width={22} height={22} /></a><small>Pádel</small></div>
          <div><a className="social-icon" href={brand.contact} target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp" title="Contactar por WhatsApp"><img src="/icons/whatsapp.svg" alt="" width={22} height={22} /></a><small>Contacto</small></div>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>Mercedes, Buenos Aires · Argentina</span>
        <Link href="/club"><LayoutDashboard size={16} aria-hidden="true" /> Mi club</Link>
        <Link href="/propuesta">Presentación del proyecto</Link>
      </div>
    </footer>
  );
}
