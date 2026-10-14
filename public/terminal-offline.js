/* Public, session-free fallback for /ingreso. No DNI or person name is persisted. */
(() => {
  'use strict';
  const KEY = 'gold-terminal-offline-v1';
  const CACHE = 'gold-terminal-shell-v1';
  const elements = Object.fromEntries(['venue', 'copy-status', 'pending', 'title', 'detail', 'form', 'dni', 'check', 'notice', 'forget'].map(id => [id, document.getElementById(id)]));
  let busy = false, syncing = false, resetTimer;
  const read = () => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      if (state.version !== 1 || typeof state.deviceId !== 'string' || !Array.isArray(state.events) || state.events.length > 2000 || typeof state.lastSeenAt !== 'string' ||
        (state.snapshot && (!Array.isArray(state.snapshot.entries) || state.snapshot.deviceId !== state.deviceId))) throw new Error('Copia inválida');
      return state;
    } catch { localStorage.removeItem(KEY); return null; }
  };
  const write = state => localStorage.setItem(KEY, JSON.stringify(state));
  const lock = work => {
    if (!navigator.locks) throw new Error('Este navegador no permite guardar consultas offline con seguridad. Continuá el control manual en recepción.');
    return navigator.locks.request('gold-terminal-offline-storage', work);
  };
  const usable = (state, now = Date.now()) => !!state?.snapshot &&
    now >= Date.parse(state.snapshot.preparedAt) - 60000 && now < Date.parse(state.snapshot.expiresAt) && now >= Date.parse(state.lastSeenAt) - 60000;
  const notice = text => { elements.notice.textContent = text; };
  const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const decision = (copy, hash, now) => {
    const memberships = copy.entries.find(entry => entry.dniHash === hash)?.memberships ?? [];
    const included = memberships.filter(m => m.access_scope === 'all' || (copy.venue === 'Pilates' ? m.access_scope === 'pilates' : m.access_scope === 'gym'));
    const selected = [...(included.length ? included : memberships)].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.expires.localeCompare(a.expires))[0];
    if (!selected) return { allowed: false, reason: 'DNI no registrado en la copia' };
    if (selected.status !== 'active') return { allowed: false, reason: 'Membresía pausada en la copia' };
    if (selected.expires < day(now)) return { allowed: false, reason: 'Cuota vencida según la copia' };
    if (!['gym', 'pilates', 'all'].includes(selected.access_scope)) return { allowed: false, reason: 'Recepción debe revisar los accesos del plan' };
    if (selected.access_scope !== 'all' && (copy.venue === 'Pilates') !== (selected.access_scope === 'pilates')) return { allowed: false, reason: 'El plan de la copia no incluye esta actividad' };
    return { allowed: true, reason: 'Membresía vigente según la copia' };
  };
  const refresh = () => {
    try {
      const state = read();
      const valid = usable(state);
      elements.venue.textContent = state?.snapshot?.venue ?? 'Terminal de ingreso';
      elements['copy-status'].textContent = valid ? `Copia preparada ${new Date(state.snapshot.preparedAt).toLocaleString('es-AR')} · vence ${new Date(state.snapshot.expiresAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sin copia vigente. Continuá el control manual en recepción.';
      elements.pending.textContent = `${state?.events.length ?? 0} consultas pendientes de sincronizar`;
      elements.dni.disabled = !valid || busy;
      elements.check.disabled = !valid || busy;
      elements.forget.disabled = !state || busy;
      if (state?.snapshot && !valid && navigator.locks) void lock(async () => {
        const latest = read();
        if (latest?.snapshot && !usable(latest)) { latest.snapshot = null; write(latest); }
      }).catch(() => notice('No pudimos actualizar el almacenamiento local.'));
    } catch { elements.dni.disabled = true; elements.check.disabled = true; notice('El almacenamiento local no está disponible. Continuá el control manual en recepción.'); }
  };
  const clear = async () => {
    const remove = async () => { try { localStorage.removeItem(KEY); localStorage.removeItem('gold-terminal-venue'); } catch { /* Do not preserve a running screen on a storage error. */ } };
    if (navigator.locks) await lock(remove); else await remove();
    window.dispatchEvent(new Event('gold-terminal-cleared'));
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(r => new URL(r.scope).pathname.replace(/\/$/, '') === '/ingreso').map(r => r.unregister()));
    }
    if ('caches' in window) await caches.delete(CACHE);
    refresh();
  };
  const request = async (path, payload) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal,
        ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
      if ([401, 403].includes(response.status)) { const error = new Error('Tu sesión terminó o no tiene acceso a la terminal.'); error.status = response.status; throw error; }
      const data = await response.json();
      if (!response.ok) { const error = new Error(data.error ?? 'No pudimos conectar con el sistema.'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); }
  };
  const reconcile = async () => {
    if (syncing || !navigator.onLine || busy) return;
    syncing = true;
    try {
      const state = read();
      if (!state) return;
      const status = await request(`/api/offline-access?deviceId=${encodeURIComponent(state.deviceId)}`);
      if (!status.deviceActive || (state.snapshot && state.snapshot.preparedBy !== status.userId)) {
        await clear(); notice('La sesión o el dispositivo cambió. Se borró la copia offline. Iniciá sesión y prepará la terminal de nuevo.'); return;
      }
      notice('La conexión volvió. Sincronizando consultas…');
      for (;;) {
        const current = read();
        if (!current || current.deviceId !== state.deviceId) return;
        if (!current.events.length) break;
        const data = await request('/api/offline-access', { action: 'sync', deviceId: current.deviceId, events: current.events.slice(0, 100) });
        if (!Array.isArray(data.acknowledged) || !data.acknowledged.length) throw new Error('No pudimos confirmar la sincronización.');
        await lock(async () => {
          const latest = read();
          if (!latest || latest.deviceId !== state.deviceId) return;
          latest.events = latest.events.filter(event => !data.acknowledged.includes(event.id));
          write(latest);
        });
        refresh();
      }
      window.location.replace('/ingreso');
    } catch (error) {
      if ([401, 403].includes(error.status)) { await clear(); notice('Tu sesión terminó o tu acceso fue desactivado. Se borraron los datos offline. Iniciá sesión para continuar.'); }
      else if (error.status === 409) notice(error.message + ' Los registros locales se conservan.');
      else notice('El sistema sigue sin conexión. Las consultas pendientes se conservan en este dispositivo.');
    } finally { syncing = false; }
  };
  elements.dni.addEventListener('input', () => { elements.dni.value = elements.dni.value.replace(/\D/g, ''); });
  elements.form.addEventListener('submit', async event => {
    event.preventDefault();
    const dni = elements.dni.value;
    if (busy || !/^\d{7,8}$/.test(dni)) return;
    busy = true; refresh(); notice(''); clearTimeout(resetTimer);
    try {
      const outcome = await lock(async () => {
        const state = read(), now = new Date();
        if (!usable(state, now.getTime())) throw new Error('La copia offline venció. Continuá el control manual en recepción.');
        if (state.events.length >= 2000) throw new Error('Hay 2000 consultas pendientes. Conectá la terminal para sincronizar o continuá el control manual en recepción.');
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${state.snapshot.salt}:${dni}`));
        const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
        const result = decision(state.snapshot, hash, now);
        state.events.push({ id: crypto.randomUUID(), snapshotId: state.snapshot.id, dniHash: hash, observedAt: now.toISOString() });
        state.lastSeenAt = now.toISOString(); write(state); return result;
      });
      elements.title.textContent = outcome.allowed ? 'Copia: membresía vigente' : 'Copia: pasá por recepción';
      elements.detail.textContent = `${outcome.reason}. Recepción debe confirmar el ingreso manualmente. No abre el molinete.`;
      elements.title.parentElement.dataset.result = 'offline';
    } catch (error) { elements.title.textContent = 'Continuá en recepción'; elements.detail.textContent = error.message; }
    finally {
      busy = false; elements.dni.value = ''; refresh(); elements.dni.focus();
      resetTimer = setTimeout(() => { elements.title.textContent = 'Ingresá tu DNI'; elements.detail.textContent = 'Esta copia es histórica. Recepción debe confirmar el ingreso manualmente; no abre el molinete.'; delete elements.title.parentElement.dataset.result; }, 10000);
    }
  });
  elements.forget.addEventListener('click', async () => {
    try {
      const state = read();
      if (state?.events.length && !window.confirm(`Se borrarán ${state.events.length} consultas pendientes y la copia de este dispositivo. ¿Continuar?`)) return;
      await clear(); notice('Los datos de este dispositivo fueron borrados.');
      if (state && navigator.onLine) try { await request('/api/offline-access', { action: 'forget', deviceId: state.deviceId }); }
      catch { notice('Los datos locales fueron borrados. No pudimos confirmar la desactivación en el servidor.'); }
    } catch { notice('No pudimos borrar el almacenamiento. Revisá los permisos del navegador.'); }
  });
  window.addEventListener('online', () => void reconcile());
  window.addEventListener('storage', refresh);
  window.addEventListener('gold-terminal-cleared', refresh);
  setInterval(() => { refresh(); void reconcile(); }, 60000);
  refresh(); elements.dni.focus(); void reconcile();
})();
