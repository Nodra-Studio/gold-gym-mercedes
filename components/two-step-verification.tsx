"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-fetch';
import { clearTerminalOffline } from '@/lib/terminal-offline';
type Factor = { id: string; type: string; status: string; label: string };
type Security = { requiresVerification: boolean; smsEnrollmentEnabled: boolean; authenticatorEnrollmentEnabled: boolean; factors: Factor[] };
export default function TwoStepVerification({ next }: { next: string }) {
  const [data, setData] = useState<Security | null>(null), [phone, setPhone] = useState(''),
    [factorId, setFactorId] = useState(''), [challengeId, setChallengeId] = useState(''),
    [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''),
    [notice, setNotice] = useState(''), [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const [method, setMethod] = useState<'phone' | 'totp'>('totp');
  const [totpSetup, setTotpSetup] = useState<{ qr: string; secret: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch('/api/mfa', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const result = await r.json() as Security & { error?: string };
      if (!r.ok) throw new Error(result.error);
      if (!controller.signal.aborted) {
        const factors = result.requiresVerification ? result.factors.filter((f: Factor) => f.status === 'verified') : result.factors;
        setData({ ...result, factors }); setError('');
        setFactorId(current => factors.some((f: Factor) => f.id === current) ? current : factors[0]?.id ?? '');
      }
    }).catch(e => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) { location.replace('/acceso?returnTo=' + encodeURIComponent('/verificar?next=' + encodeURIComponent(next))); return; }
      setError(e instanceof Error ? e.message : 'No pudimos revisar tu seguridad.');
    });
    return () => controller.abort();
  }, [refresh, next]);
  const selected = data?.factors.find(f => f.id === factorId);
  async function post(payload: object) {
    const response = await apiFetch('/api/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; factorId?: string; challengeId?: string; verified?: boolean; removed?: boolean; totpSetup?: { qr: string; secret: string } };
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  async function send() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let id = factorId;
      if (!id) {
        const enrolled = await post({ action: 'enroll', factorType: method, ...(method === 'phone' ? { phone: phone.replace(/[\s()-]/g, '') } : {}) });
        if (!enrolled.factorId) throw new Error('No pudimos configurar la verificación. Volvé a intentar.');
        id = enrolled.factorId; setFactorId(id);
        setTotpSetup(enrolled.totpSetup ?? null);
      }
      const result = await post({ action: 'challenge', factorId: id });
      if (!result.challengeId) throw new Error('No pudimos preparar la verificación. Volvé a intentar.');
      setChallengeId(result.challengeId); setCode('');
      setNotice(selected?.type === 'totp' || (!selected && method === 'totp') ? selected?.status === 'verified' ? 'Ingresá el código que muestra tu aplicación.' : 'Agregá Gold Gym a tu aplicación e ingresá el código que muestra.' : 'Enviamos un código al teléfono indicado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos enviar el código.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <main className="account-page"><section className="workspace" style={{ maxWidth: 640, margin: 'auto' }}>
    <p className="eyebrow">SEGURIDAD DE TU CUENTA</p><h1>Verificación en dos pasos</h1>
    <p>Además de la contraseña, confirmá tu acceso con el código de una aplicación autenticadora gratuita. Funciona sin conexión y no requiere SMS.</p>
    {error && <div className="error-box" role="alert"><p>{error}</p>{!data && <button className="button" onClick={() => setRefresh(n => n + 1)}>Volver a cargar</button>}</div>}
    {notice && <p className="success-box" role="status">{notice}</p>}
    {!data && !error && <p role="status">Revisando tu cuenta…</p>}
    {data && <section className="panel">
      {data.requiresVerification && <p className="notice">Ingresá el código para abrir las herramientas del club.</p>}
      {data.factors.length > 0 && <label className="field">Método de verificación<select value={factorId} disabled={busy} onChange={e => { setFactorId(e.target.value); setChallengeId(''); setCode(''); }}>
        {data.factors.map(f => <option key={f.id} value={f.id}>{f.label}{f.status !== 'verified' ? ' · pendiente de confirmar' : ''}</option>)}
      </select></label>}
      {!factorId && data.smsEnrollmentEnabled && <label className="field">Método de verificación<select value={method} disabled={busy} onChange={e => setMethod(e.target.value as 'phone' | 'totp')}>
        <option value="totp">Aplicación autenticadora</option><option value="phone">Mensaje SMS</option>
      </select></label>}
      {!factorId && method === 'totp' && <p>Podés usar una aplicación como Google Authenticator o Microsoft Authenticator.</p>}
      {!factorId && method === 'phone' && <label className="field">Teléfono con código de país<input type="tel" autoComplete="tel" placeholder="+5492324123456" maxLength={24} value={phone} disabled={busy || !data.smsEnrollmentEnabled} onChange={e => setPhone(e.target.value)} /></label>}
      {!factorId && method === 'phone' && !data.smsEnrollmentEnabled && <p className="notice">La verificación por SMS todavía no está disponible. Administración debe habilitar el envío para este club.</p>}
      <button className="button gold" type="button" disabled={busy || (!factorId && (method === 'phone' ? !phone || !data.smsEnrollmentEnabled : !data.authenticatorEnrollmentEnabled))} onClick={() => void send()}>{busy ? 'Procesando…' : (selected?.type ?? method) === 'totp' ? selected?.status === 'verified' ? 'Ingresar código' : challengeId ? 'Preparar otra verificación' : 'Configurar aplicación' : challengeId ? 'Enviar otro código' : 'Enviar código por SMS'}</button>
      {totpSetup && <section aria-label="Configurar aplicación autenticadora">
        <p>Escaneá este código con tu aplicación. También podés ingresar la clave manualmente.</p>
        {(totpSetup.qr.startsWith('data:image/svg+xml;') || totpSetup.qr.startsWith('<svg')) && <img width={200} height={200} alt="Código QR para agregar Gold Gym a tu aplicación autenticadora" src={totpSetup.qr.startsWith('<svg') ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(totpSetup.qr) : totpSetup.qr} />}
        <p>Clave de configuración: <code>{totpSetup.secret}</code></p>
      </section>}
      {challengeId && <form onSubmit={async e => {
        e.preventDefault(); if (saving.current) return; saving.current = true; setBusy(true); setError('');
        try {
          const result = await post({ action: 'verify', factorId, challengeId, code });
          if (!result.verified) throw new Error('No pudimos confirmar la verificación. Volvé a intentar.');
          location.replace(next);
        }
        catch (e) { setError(e instanceof Error ? e.message : 'No pudimos verificar el código.'); }
        finally { saving.current = false; setBusy(false); }
      }}><label className="field">Código de verificación<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label><button className="button gold" disabled={busy}>Verificar y continuar</button></form>}
      {!data.requiresVerification && <p><Link className="button" href={next}>Continuar</Link></p>}
      {selected && !data.requiresVerification && <button className="button small" disabled={busy} onClick={async () => {
        if (saving.current || !confirm('¿Quitar este método de verificación de tu cuenta?')) return;
        saving.current = true; setBusy(true); setError('');
        try { await post({ action: 'remove', factorId }); setFactorId(''); setChallengeId(''); setTotpSetup(null); setRefresh(n => n + 1); }
        catch (e) { setError(e instanceof Error ? e.message : 'No pudimos quitar el método.'); }
        finally { saving.current = false; setBusy(false); }
      }}>Quitar este método</button>}
    </section>}
    <p><Link href="/cuenta">Mi cuenta</Link></p>
    <button className="button" type="button" disabled={busy} onClick={async () => {
      if (saving.current) return;
      saving.current = true; setBusy(true); setError('');
      try {
        const response = await apiFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
        if (!response.ok) throw new Error('No pudimos cerrar sesión. Volvé a intentar.');
        await clearTerminalOffline().catch(() => undefined);
        location.replace('/acceso');
      } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos cerrar sesión.'); }
      finally { saving.current = false; setBusy(false); }
    }}>Cerrar sesión</button>
  </section></main>;
}
