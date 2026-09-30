import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarDays, UserRound, ScanLine, Users, ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
export const metadata: Metadata = { title: 'Mi club · Gold Gym' };
export default function Club() {
  return <><SiteHeader /><main className="club-home">
    <header className="club-intro"><p className="eyebrow">GOLD GYM / MI CLUB</p><h1>Todo tu club.<br /><em>En un solo lugar.</em></h1><p>Entrená en cualquiera de nuestras sedes, organizá tu próximo partido y accedé a tu cuenta.</p><Link href="/cuenta" className="button gold"><UserRound size={19} aria-hidden="true" /> Entrar a mi cuenta</Link></header>
    <div className="club-services">
      <Link href="/jugar" className="club-service"><CalendarDays size={30} aria-hidden="true" /><div><small>PÁDEL</small><h2>Tu próximo partido</h2><p>Elegí día, horario y cancha. Tus reservas, siempre a mano.</p></div><ArrowRight aria-hidden="true" /></Link>
      <Link href="/ingreso" className="club-service"><ScanLine size={30} aria-hidden="true" /><div><small>ACCESO AL CLUB</small><h2>Tu DNI. Todas las sedes.</h2><p>Una única membresía y el mismo ingreso, estés donde estés. Terminal para recepción.</p></div><ArrowRight aria-hidden="true" /></Link>
      <Link href="/gestion" className="club-service"><Users size={30} aria-hidden="true" /><div><small>ADMINISTRACIÓN</small><h2>El club, organizado</h2><p>Socios, cuotas, clases y agenda desde la gestión de Gold Gym.</p></div><ArrowRight aria-hidden="true" /></Link>
    </div>
  </main><SiteFooter /></>;
}
