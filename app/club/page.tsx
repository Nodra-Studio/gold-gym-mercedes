import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { brand } from '@/lib/content';
export const metadata = { title: 'El club · Gold Gym' };
export default function Club() {
  return <><SiteHeader /><main className="club-home">
    <header className="club-intro"><p className="eyebrow">GOLD GYM / SOCIOS</p><h1>Tu DNI.<br /><em>Tu entrada al club.</em></h1><p>No necesitás crear una cuenta ni recordar una contraseña. Recepción se encarga de tu inscripción.</p><a href={brand.contact} className="button gold">Consultar en recepción</a></header>
    <div className="club-services">
      <section className="club-service"><div><small>01 / INSCRIPCIÓN</small><h2>Registrate en recepción</h2><p>El personal carga tu nombre, DNI, teléfono y plan, y registra tus pagos.</p></div></section>
      <section className="club-service"><div><small>02 / INGRESO</small><h2>Ingresá tu DNI en la terminal</h2><p>La pantalla del club te indica si podés pasar. Si tu cuota vence dentro de los próximos 7 días, te avisa para que la renueves.</p></div></section>
      <section className="club-service"><div><small>03 / RESERVAS</small><h2>Coordiná con recepción</h2><p>El personal registra tus clases y reservas de pádel. Todo sin crear una cuenta.</p></div></section>
    </div><p style={{marginTop:40}}><Link href="/acceso" className="text-link">Acceso del personal</Link></p>
  </main><SiteFooter /></>;
}
