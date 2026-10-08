"use client";
import { apiFetch } from "@/lib/api-fetch";
import { terminalDisplay, type TerminalResult } from "@/lib/terminal-display";
import { useState, useRef, useEffect } from "react";
import { CheckCircle2, TriangleAlert, CircleX, Maximize, Minimize, Settings2, LoaderCircle, ArrowRight } from "lucide-react";
const venues = ['Calle 30', 'Calle 23', 'Club Unión', 'Pilates'];
export default function Kiosk() {
  const [venue, setVenue] = useState('');
  const [settings, setSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dni, setDni] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toolError, setToolError] = useState('');
  const [result, setResult] = useState<TerminalResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gold-terminal-venue') ?? '';
      const restored = ['Unión Gold Club', 'Club Vélez'].includes(saved) ? 'Club Unión' : saved;
      if (venues.includes(restored)) setVenue(restored);
      else setSettings(true);
    } catch { setSettings(true); }
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => { pending.current?.abort(); document.removeEventListener('fullscreenchange', sync); };
  }, []);
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
    setBusy(true); setError(''); setResult(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await apiFetch('/api/club', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ action: 'access', dni, venue }),
      });
      const data = await response.json() as TerminalResult & { error?: string };
      if (!response.ok) throw new Error(data.error);
      if (typeof data.allowed !== 'boolean' || typeof data.reason !== 'string') throw new Error('Respuesta inválida');
      if (controller.signal.aborted) return;
      setResult(data); setDni('');
    } catch {
      if (!controller.signal.aborted) { setError('No pudimos verificar tu ingreso'); setDni(''); }
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) { setBusy(false); input.current?.focus(); }
    }
  }
  const display = result ? terminalDisplay(result) : null;
  const tone = error ? 'error' : busy ? 'checking' : display?.tone ?? 'idle';
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
    </section>}
    <section className="entry-signal" role="status" aria-live="polite" aria-atomic="true">
      {busy ? <><LoaderCircle className="entry-symbol animate-spin" aria-hidden="true" /><h1>Verificando…</h1><p>Esperá un momento</p></> : error ? <><TriangleAlert className="entry-symbol" aria-hidden="true" /><h1>No pudimos verificar</h1><p>Pasá por recepción</p></> : display ? <>
        {display.tone === 'ready' ? <CheckCircle2 className="entry-symbol" aria-hidden="true" /> : display.tone === 'warning' ? <TriangleAlert className="entry-symbol" aria-hidden="true" /> : <CircleX className="entry-symbol" aria-hidden="true" />}
        <h1>{display.title}</h1>
        <p className="entry-detail">{display.detail}</p>
        {result?.name && <p className="entry-name">{result.name}</p>}
      </> : <><span className="entry-eyebrow">BIENVENIDO A GOLD</span><h1>Ingresá tu DNI</h1><p>{venue ? 'Sin puntos. Después, presioná Enter.' : 'Recepción debe seleccionar la sede para comenzar.'}</p></>}
    </section>
    <form className="entry-form" onSubmit={check} aria-busy={busy}>
      <label htmlFor="entry-dni" className="sr-only">Número de DNI</label>
      <input id="entry-dni" ref={input} inputMode="numeric" pattern="[0-9]{7,8}" maxLength={8} required autoComplete="off" spellCheck={false} readOnly={busy} disabled={!venue || settings} value={dni} onChange={event => { setDni(event.target.value.replace(/\D/g, '')); setResult(null); setError(''); }} placeholder="Tu DNI" />
      <button type="submit" disabled={busy || !venue || settings || dni.length < 7}>{busy ? 'Verificando…' : 'Ingresar'}<ArrowRight size={28} aria-hidden="true" /></button>
    </form>
  </main>;
}
