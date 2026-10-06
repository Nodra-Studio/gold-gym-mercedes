import Link from 'next/link';
import GateTerminal from '@/components/gate-terminal';
import { requirePageRole } from '@/lib/page-access';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await requirePageRole(['owner', 'reception', 'gate'], '/ingreso');
  if (user.role === 'gate') return <GateTerminal />;
  return <main className="workspace" style={{maxWidth:720}}><p className="eyebrow">TERMINAL DE INGRESO</p><h1>Prepará la pantalla del molinete.</h1><section className="panel"><p>En esta computadora tenés abierta una cuenta de administración o recepción.</p><p style={{marginTop:20}}>Para dejar la pantalla a los clientes, iniciá sesión con una cuenta del personal que el dueño haya habilitado con el rol Terminal de ingreso. Esa cuenta solo verifica DNI y no puede abrir la gestión.</p><p style={{marginTop:20}}>El cliente no se registra ni inicia sesión: solo escribe su DNI. La terminal muestra si puede ingresar y avisa desde 7 días antes del vencimiento.</p><Link href="/cuenta" className="button gold" style={{marginTop:24}}>Cambiar cuenta de esta terminal</Link><p style={{marginTop:20}}><Link href="/equipo" className="text-link">Administrar accesos del personal</Link></p></section></main>;
}
