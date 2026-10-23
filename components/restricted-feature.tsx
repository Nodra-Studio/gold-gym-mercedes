import Link from "next/link";
import { LockKeyhole, ArrowLeft, UserRound } from "lucide-react";
import { restrictedFeatures, type RestrictedFeaturePath } from "@/lib/features";

export function RestrictedFeature({ path }: { path: RestrictedFeaturePath }) {
  const feature = restrictedFeatures.find((item) => item.href === path)!;
  return (
    <main className="workspace restricted-feature">
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / GESTIÓN DEL CLUB</p>
          <h1>{feature.label}</h1>
          <p className="muted">{feature.description}</p>
        </div>
      </header>
      <section className="restricted-panel" aria-labelledby="restricted-title">
        <div className={`restricted-preview restricted-preview--${feature.preview}`} aria-hidden="true">
          <div className="restricted-preview-toolbar"><i /><i /></div>
          <div className="restricted-preview-summary"><i /><i /><i /></div>
          <div className="restricted-preview-rows"><i /><i /><i /><i /></div>
        </div>
        <div className="restricted-explanation">
          <span className="restricted-badge"><LockKeyhole size={15} aria-hidden="true" /> Solo dueños</span>
          <h2 id="restricted-title">Esta función requiere permiso de dueño</h2>
          <p>Tu cuenta de Recepción permite realizar las tareas diarias del club. Esta sección está reservada a los dueños y su información permanece protegida.</p>
          <p className="muted">Si necesitás realizar un cambio acá, pedíselo a uno de los dueños.</p>
          <div className="form-actions">
            <Link href="/gestion" className="button gold"><ArrowLeft size={16} aria-hidden="true" /> Volver a gestión</Link>
            <Link href="/cuenta" className="button"><UserRound size={16} aria-hidden="true" /> Ver mis permisos</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ScopeRestricted({title}:{title:string}) { return <main className="workspace restricted-feature"><header className="work-header"><div><p className="eyebrow">GOLD GYM / PERMISOS</p><h1>{title}</h1></div></header><section className="restricted-panel"><div className="restricted-preview restricted-preview--reports" aria-hidden="true"><div className="restricted-preview-toolbar"><i/><i/></div><div className="restricted-preview-rows"><i/><i/><i/></div></div><div className="restricted-explanation"><span className="restricted-badge"><LockKeyhole size={15}/> Acceso limitado</span><h2>Esta actividad está fuera de tu alcance</h2><p>Los dueños pueden asignarte acceso a esta actividad desde Equipo y permisos.</p><Link href="/gestion" className="button gold">Volver a gestión</Link></div></section></main>; }
