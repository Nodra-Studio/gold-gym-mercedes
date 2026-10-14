"use client";
import "./gate-terminal.css";
import { terminalDisplay, type TerminalResult } from "@/lib/terminal-display";
import { clearTerminalOffline, newTerminalOffline, readTerminalOffline, recordOfflineLookup, snapshotUsable, terminalStorageLock, terminalVenues, writeTerminalOffline, type OfflineSnapshot, type TerminalOfflineStore } from "@/lib/terminal-offline";
import { useState, useRef, useEffect, useCallback } from "react";
import { CheckCircle2, TriangleAlert, CircleX, Maximize, Minimize, Settings2, LoaderCircle, ArrowRight } from "lucide-react";
const venues = terminalVenues;
class TerminalHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function terminalRequest(path: string, payload?: unknown, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal,
      ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    if ([401, 403].includes(response.status)) throw new TerminalHttpError('Tu sesión terminó o no tiene acceso a la terminal.', response.status);
    const data = await response.json() as { error?: unknown };
    if (!response.ok) throw new TerminalHttpError(typeof data.error === 'string' ? data.error : 'No pudimos conectar con el sistema.', response.status);
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function installTerminalShell() {
  if (!window.isSecureContext || !navigator.serviceWorker || !navigator.locks)
    throw new Error('La preparación offline necesita HTTPS y una versión actual de tu navegador.');
  const registration = await navigator.serviceWorker.register('/terminal-sw.js', { scope: '/ingreso' });
  if (!registration.active) await new Promise<void>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error('No pudimos preparar la pantalla offline.')); return; }
    const timer = setTimeout(() => reject(new Error('La preparación offline tardó demasiado. Volvé a intentar.')), 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
      if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('No pudimos preparar la pantalla offline.')); }
    });
  });
}
export default function Kiosk() {
  const [venue, setVenue] = useState('');
  const [settings, setSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dni, setDni] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toolError, setToolError] = useState('');
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [resultOffline, setResultOffline] = useState(false);
  const [offlineStore, setOfflineStore] = useState<TerminalOfflineStore | null>(null);
  const [connected, setConnected] = useState(true);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState('');
  const [clock, setClock] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const reconciling = useRef(false);
  const preparing = useRef(false);
  const invalidateOffline = useCallback(async (message: string) => {
    await clearTerminalOffline();
    setOfflineStore(null); setResult(null); setDni(''); setVenue(''); setSettings(true);
    setOfflineNotice(message);
  }, []);
  const reconcile = useCallback(async () => {
    if (reconciling.current || preparing.current) return;
    if (!navigator.onLine) { setConnected(false); return; }
    reconciling.current = true;
    try {
      const stored = readTerminalOffline();
      setOfflineStore(stored);
      if (!stored) { setConnected(true); return; }
      const status = await terminalRequest(`/api/offline-access?deviceId=${encodeURIComponent(stored.deviceId)}`) as { userId: string; deviceActive: boolean };
      if (!status.deviceActive || (stored.snapshot && status.userId !== stored.snapshot.preparedBy)) {
        await invalidateOffline('La sesión o el dispositivo cambió. La copia local fue borrada; prepará la terminal de nuevo con una cuenta autorizada.');
        return;
      }
      setConnected(true);
      for (;;) {
        const current = readTerminalOffline();
        if (!current || current.deviceId !== stored.deviceId || !current.events.length) break;
        const data = await terminalRequest('/api/offline-access', { action: 'sync', deviceId: current.deviceId, events: current.events.slice(0, 100) }) as { acknowledged: string[] };
        if (!Array.isArray(data.acknowledged) || !data.acknowledged.length) throw new Error('No pudimos confirmar la sincronización.');
        await terminalStorageLock(async () => {
          const latest = readTerminalOffline();
          if (!latest || latest.deviceId !== stored.deviceId) return;
          latest.events = latest.events.filter(e => !data.acknowledged.includes(e.id));
          if (latest.snapshot && !snapshotUsable(latest.snapshot, latest.snapshot.venue, new Date(), latest.lastSeenAt)) latest.snapshot = null;
          writeTerminalOffline(latest); setOfflineStore(latest);
        });
        setOfflineNotice('Consultas offline sincronizadas. El historial distingue la copia utilizada del estado actual.');
      }
    } catch (cause) {
      if (cause instanceof TerminalHttpError && [401, 403].includes(cause.status))
        await invalidateOffline('Tu sesión terminó o fue desactivada. Se borraron los datos offline; iniciá sesión para preparar la terminal.');
      else { if (!(cause instanceof TerminalHttpError) || cause.status >= 500) setConnected(false);
        setOfflineNotice(cause instanceof Error ? cause.message : 'No pudimos sincronizar. Las consultas siguen guardadas.'); }
    } finally { reconciling.current = false; }
  }, [invalidateOffline]);
  async function prepareOffline() {
    if (!venue || offlineBusy || !navigator.onLine) return;
    preparing.current = true;
    setOfflineBusy(true); setOfflineNotice('');
    try {
      await installTerminalShell();
      const stored = await terminalStorageLock(async () => {
        const value = readTerminalOffline() ?? newTerminalOffline();
        writeTerminalOffline(value); return value;
      });
      const data = await terminalRequest('/api/offline-access', { action: 'prepare', deviceId: stored.deviceId, venue }) as { snapshot: OfflineSnapshot };
      if (data.snapshot?.deviceId !== stored.deviceId || data.snapshot.venue !== venue) throw new Error('La copia recibida no corresponde a esta terminal.');
      await terminalStorageLock(async () => {
        const latest = readTerminalOffline();
        if (!latest || latest.deviceId !== stored.deviceId) throw new Error('Los datos del dispositivo fueron borrados. Prepará la terminal de nuevo.');
        latest.snapshot = data.snapshot; latest.lastSeenAt = new Date().toISOString();
        writeTerminalOffline(latest); setOfflineStore(latest);
      });
      setConnected(true); setOfflineNotice('Terminal preparada por 8 horas. Si se corta internet, la copia sirve para continuar el control manual.');
    } catch (cause) {
      if (cause instanceof TerminalHttpError && [401, 403].includes(cause.status)) await invalidateOffline('No hay una sesión autorizada. Se borraron los datos locales de la terminal.');
      else setOfflineNotice(cause instanceof Error ? cause.message : 'No pudimos preparar el dispositivo.');
    } finally { preparing.current = false; setOfflineBusy(false); }
  }
  async function forgetDevice() {
    if (offlineStore?.events.length && !window.confirm(`Se borrarán ${offlineStore.events.length} consultas todavía sin sincronizar y la copia de este dispositivo. ¿Continuar?`)) return;
    const deviceId = offlineStore?.deviceId;
    await clearTerminalOffline(); setOfflineStore(null); setOfflineNotice('La copia y los registros locales fueron borrados.');
    if (deviceId && navigator.onLine) {
      try { await terminalRequest('/api/offline-access', { action: 'forget', deviceId }); }
      catch { setOfflineNotice('Los datos locales fueron borrados. No pudimos confirmar la desactivación del dispositivo en el servidor.'); }
    }
  }
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    const refresh = () => { try { setOfflineStore(readTerminalOffline()); } catch { setOfflineNotice('El navegador bloqueó el almacenamiento local. El modo offline no está disponible.'); } };
    const network = () => { setConnected(navigator.onLine); if (navigator.onLine) void reconcile(); };
    const cleared = () => { setOfflineStore(null); setResult(null); setDni(''); };
    const initialFrame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem('gold-terminal-venue') ?? '';
        const restored = ['Unión Gold Club', 'Club Vélez'].includes(saved) ? 'Club Unión' : saved;
        if (venues.some(v => v === restored)) setVenue(restored);
        else setSettings(true);
      } catch { setSettings(true); }
      refresh(); network();
    });
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('storage', refresh); window.addEventListener('gold-terminal-cleared', cleared);
    const timer = setInterval(() => {
      setClock(Date.now());
      void terminalStorageLock(async () => {
        const stored = readTerminalOffline();
        if (stored?.snapshot && !snapshotUsable(stored.snapshot, stored.snapshot.venue, new Date(), stored.lastSeenAt)) {
          stored.snapshot = null; writeTerminalOffline(stored); setOfflineStore(stored);
        }
      }).catch(() => { /* Online checks remain available if local storage is blocked. */ });
      if (navigator.onLine) void reconcile();
    }, 60000);
    return () => { pending.current?.abort(); cancelAnimationFrame(initialFrame); clearInterval(timer); document.removeEventListener('fullscreenchange', sync);
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
      window.removeEventListener('storage', refresh); window.removeEventListener('gold-terminal-cleared', cleared); };
  }, [reconcile]);
  useEffect(() => {
    if (!result && !error) return;
    const timer = setTimeout(() => { setResult(null); setError(''); setDni(''); input.current?.focus(); }, 10000);
    return () => clearTimeout(timer);
  }, [result, error]);
  useEffect(() => { if (venue && !settings) input.current?.focus(); }, [venue, settings]);
  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !venue || !/^\d{7,8}$/.test(dni)) return;
    saving.current = true;
    setBusy(true); setError(''); setResult(null); setResultOffline(false);
    const controller = new AbortController();
    pending.current = controller;
    try {
      if (!navigator.onLine) throw new TypeError('Sin conexión');
      const data = await terminalRequest('/api/club', { action: 'access', dni, venue }, controller.signal) as TerminalResult;
      if (typeof data.allowed !== 'boolean' || typeof data.reason !== 'string') throw new Error('Respuesta inválida');
      if (controller.signal.aborted) return;
      setConnected(true); setResult(data); setDni('');
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof TerminalHttpError && [401, 403].includes(cause.status)) {
        await invalidateOffline('Tu sesión terminó o tu acceso fue desactivado. Se borró la copia offline.');
        setError('Iniciá sesión con una cuenta autorizada para usar la terminal.');
      } else if (cause instanceof TerminalHttpError && cause.status < 500) setError(cause.message);
      else {
        setConnected(false);
        try {
          const lookup = await recordOfflineLookup(venue, dni);
          setOfflineStore(lookup.store); setResult({ ...lookup.decision, name: null }); setResultOffline(true);
        } catch (offlineError) { setError(offlineError instanceof Error ? offlineError.message : 'Continuá el control manual en recepción.'); }
      }
      setDni('');
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) { setBusy(false); input.current?.focus(); }
    }
  }
  const display = result ? resultOffline
    ? { tone: 'warning' as const, title: result.allowed ? 'Copia: membresía vigente' : 'Copia: pasá por recepción', detail: `${result.reason}. Recepción debe confirmar el ingreso manualmente.` }
    : terminalDisplay(result) : null;
  const tone = error ? 'error' : busy ? 'checking' : display?.tone ?? 'idle';
  const copy = offlineStore?.snapshot;
  const usableCopy = snapshotUsable(copy ?? null, venue, new Date(clock), offlineStore?.lastSeenAt);
  return <main className={`entry-terminal entry-terminal--${tone}`}>
    <header className="entry-header">
      <div className="entry-brand"><img src="/images/logo.webp" alt="Gold Gym" width={46} height={46} /><span>{venue || 'Terminal de ingreso'}</span></div>
      <div className="entry-tools">
        <button type="button" disabled={busy} aria-label="Configurar terminal" aria-expanded={settings} aria-controls="entry-settings" onClick={() => setSettings(value => !value)}><Settings2 size={21} /></button>
        <button type="button" aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={async () => {
          setToolError('');
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            else setToolError('Usá la opción de pantalla completa del navegador.');
          } catch { setToolError('No se pudo activar pantalla completa. Usá el menú del navegador.'); }
        }}>{fullscreen ? <Minimize size={21} /> : <Maximize size={21} />}</button>
      </div>
    </header>
    <aside className="entry-offline-status" aria-live="polite">
      <strong>{connected ? 'Conectado al sistema' : 'Sin conexión con el sistema · control manual'}</strong>
      <span>{usableCopy && copy ? `Copia de ${copy.venue} · vence ${new Date(copy.expiresAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sin copia offline vigente para esta sede'}</span>
      <span>{offlineStore?.events.length ?? 0} consultas pendientes de sincronizar</span>
    </aside>
    {toolError && <p className="entry-tool-error" role="alert">{toolError}</p>}
    {settings && <section className="entry-settings" id="entry-settings" aria-label="Configuración de la terminal">
      <label htmlFor="entry-venue">Sede de esta pantalla</label>
      <select id="entry-venue" value={venue} disabled={busy} onChange={event => {
        const value = event.target.value;
        setVenue(value); setResult(null); setError(''); setDni('');
        try { localStorage.setItem('gold-terminal-venue', value); } catch { /* Selection still works for this session. */ }
      }}><option value="">Seleccioná la sede</option>{venues.map(v => <option key={v}>{v}</option>)}</select>
      <button type="button" disabled={!venue} onClick={() => setSettings(false)}>Listo</button>
      <p>La sede se recuerda en este navegador. La apertura del molinete físico aún no está conectada.</p>
      <button type="button" disabled={!venue || busy || offlineBusy || !connected} onClick={() => void prepareOffline()}>{offlineBusy ? 'Preparando…' : 'Preparar copia offline por 8 horas'}</button>
      <button type="button" disabled={busy || offlineBusy || !connected || !offlineStore?.events.length} onClick={() => void reconcile()}>Sincronizar consultas</button>
      <button type="button" disabled={busy || offlineBusy || !offlineStore} onClick={() => void forgetDevice()}>Borrar datos de este dispositivo</button>
      <p>La copia sólo guarda referencias de DNI, estado, vencimiento y actividad. Sirve para continuidad manual; las altas, bajas y pagos posteriores necesitan conexión para actualizarse.</p>
    </section>}
    {offlineNotice && <p className="entry-tool-error" role="status">{offlineNotice}</p>}
    <section className="entry-signal" role="status" aria-live="polite" aria-atomic="true">
      {busy ? <><LoaderCircle className="entry-symbol animate-spin" aria-hidden="true" /><h1>Verificando…</h1><p>Esperá un momento</p></> : error ? <><TriangleAlert className="entry-symbol" aria-hidden="true" /><h1>No pudimos verificar</h1><p>{error}</p></> : display ? <>
        {display.tone === 'ready' ? <CheckCircle2 className="entry-symbol" aria-hidden="true" /> : display.tone === 'warning' ? <TriangleAlert className="entry-symbol" aria-hidden="true" /> : <CircleX className="entry-symbol" aria-hidden="true" />}
        <h1>{display.title}</h1>
        <p className="entry-detail">{display.detail}</p>
        {result?.name && <p className="entry-name">{result.name}</p>}
        {resultOffline && <p className="entry-offline-detail">SIN CONEXIÓN · Copia histórica, pendiente de sincronización. No abre el molinete.</p>}
      </> : <><span className="entry-eyebrow">BIENVENIDO A GOLD</span><h1>Ingresá tu DNI</h1><p>{venue ? 'Sin puntos. Después, presioná Enter.' : 'Recepción debe seleccionar la sede para comenzar.'}</p></>}
    </section>
    <form className="entry-form" onSubmit={check} aria-busy={busy}>
      <label htmlFor="entry-dni" className="sr-only">Número de DNI</label>
      <input id="entry-dni" ref={input} inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} required autoComplete="off" spellCheck={false} readOnly={busy} disabled={!venue || settings} value={dni} onChange={event => { setDni(event.target.value.replace(/\D/g, '')); setResult(null); setError(''); }} placeholder="Tu DNI" />
      <button type="submit" disabled={busy || !venue || settings || dni.length < 7}>{busy ? 'Verificando…' : 'Ingresar'}<ArrowRight size={28} aria-hidden="true" /></button>
    </form>
  </main>;
}
