'use client';
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { useEffect, useState } from 'react';
import Link from 'next/link';
export default function Account() {
  const [account, setAccount] = useState<{ userId: string; role: string } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/team', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as { userId: string; role: string; error?: string };
      if (!response.ok) throw new Error(data.error);
      setAccount(data);
    }).catch(e => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) { location.assign('/acceso'); return; }
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, []);
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      if (!response.ok) throw new Error('No pudimos cerrar sesión. Volvé a intentar.');
      location.assign('/acceso');
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const destination = account?.role === 'player' ? '/jugar' : account?.role === 'gate' ? '/ingreso' : '/gestion';
  const active = account && ['owner', 'reception', 'gate', 'player'].includes(account.role);
  return <main className="workspace" style={{ maxWidth: 700 }}>
    <Link href="/" className="text-link">← Volver al inicio</Link>
    <header className="work-header"><div><p className="eyebrow">GOLD GYM</p><h1>Tu cuenta.</h1></div></header>
    {error && <p className="error-box" role="alert">{error}</p>}
    <section className="panel">
      {!account && !error && <p role="status">Cargando tu acceso…</p>}
      {account && <><p>{active ? 'Tu acceso está habilitado.' : 'La administración debe habilitar tu acceso al club.'}</p>
        <p style={{ marginTop: 20 }}>Identificador para compartir con la administración:</p><code style={{ overflowWrap: 'anywhere' }}>{account.userId}</code>
        {active && <p style={{ marginTop: 24 }}><Link href={destination} className="button gold">Abrir mi espacio</Link></p>}</>}
      <button className="button" style={{ marginTop: 24 }} onClick={logout} disabled={busy}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button>
    </section>
  </main>;
}
