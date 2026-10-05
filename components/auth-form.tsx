'use client';
import { apiFetch } from "@/lib/api-fetch";
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
type Mode = 'login' | 'signup' | 'recover' | 'password';
const content: Record<Mode, { title: string; intro: string; button: string }> = {
  login: { title: 'Ingresá a tu club.', intro: 'Usá tu correo y contraseña para acceder a tu cuenta.', button: 'Iniciar sesión' },
  signup: { title: 'Creá tu cuenta.', intro: 'Después de confirmar tu correo, la administración podrá habilitar tu acceso.', button: 'Crear cuenta' },
  recover: { title: 'Recuperá el acceso.', intro: 'Te enviaremos un enlace para elegir una nueva contraseña.', button: 'Enviar enlace' },
  password: { title: 'Elegí una nueva contraseña.', intro: 'Usá al menos 8 caracteres. Al guardarla, vas a iniciar sesión nuevamente.', button: 'Guardar contraseña' },
};
export default function AuthForm({ mode, configured, initialError = '', initialMessage = '' }: { mode: Mode; configured: boolean; initialError?: string; initialMessage?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialError), [message, setMessage] = useState(initialMessage);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, email: data.get('email') ?? undefined, password: data.get('password') ?? undefined, returnTo: new URLSearchParams(location.search).get('returnTo') ?? '/cuenta' }) });
      const result = await response.json() as { error?: string; next?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos completar la solicitud.');
      if (result.next) location.assign(result.next); else setMessage(result.message ?? "Solicitud completada.");
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos conectar. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }
  const text = content[mode];
  return <main className="workspace" style={{ maxWidth: 560, paddingTop: 'clamp(40px,10vh,110px)' }}>
    <Link href="/" className="text-link">← Gold Gym Mercedes</Link>
    <header className="work-header"><div><p className="eyebrow">TU CUENTA</p><h1>{text.title}</h1><p>{text.intro}</p></div></header>
    {!configured && <p className="error-box" role="status">El acceso está en preparación. La web del club sigue disponible.</p>}
    <form className="panel" onSubmit={submit} aria-busy={busy}>
      {mode !== 'password' && <label className="field">Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={!configured || busy} /></label>}
      {mode !== 'recover' && <label className="field">Contraseña<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 8} maxLength={128} required disabled={!configured || busy} /></label>}
      {(mode === 'signup' || mode === 'password') && <p style={{ marginTop: 8 }}>Usá al menos 8 caracteres.</p>}
      {error && <p role="alert" className="error-box">{error}</p>}
      {message && <p role="status" className="success-box">{message}</p>}
      <button className="button gold" disabled={!configured || busy} style={{ marginTop: 20 }}>{busy ? 'Procesando…' : text.button}</button>
    </form>
    <nav aria-label="Acceso a la cuenta" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 24 }}>
      {mode !== 'login' && <Link className="text-link" href="/acceso">Iniciar sesión</Link>}
      {mode === 'login' && <><Link className="text-link" href="/recuperar">Olvidé mi contraseña</Link><Link className="text-link" href="/crear-cuenta">Crear cuenta</Link></>}
    </nav>
  </main>;
}
