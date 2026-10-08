"use client";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, LogOut, ScanLine, ArrowUpRight, ShieldCheck, Clock3 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { portalForRole } from "@/lib/auth/navigation";

type AccountData = { userId: string; role: string };
const roleLabels: Record<string, string> = {
  owner: "Administración", reception: "Recepción", gate: "Terminal de ingreso",
  player: "Jugador de pádel", pending: "Pendiente de habilitación", revoked: "Acceso desactivado",
};
export default function Account() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false), [revision, setRevision] = useState(0);
  const waiting = account?.role === "pending";
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await apiFetch("/api/team", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as AccountData & { error?: string };
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        if (waiting && ["owner", "reception", "gate", "player"].includes(data.role)) {
          location.replace("/portal");
          return;
        }
        setAccount(data);
        setError("");
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) { location.replace("/acceso"); return; }
        setError(e instanceof Error ? e.message : "No pudimos cargar tu cuenta.");
      } finally { loading = false; }
    };
    void load();
    const sync = () => { if (document.visibilityState === "visible") void load(); };
    const timer = waiting ? setInterval(sync, 15000) : undefined;
    if (waiting) window.addEventListener("focus", sync);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [waiting, revision]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function logout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("No pudimos cerrar sesión. Volvé a intentar.");
      location.replace("/acceso");
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const active = !!account && ["owner", "reception", "gate", "player"].includes(account.role);
  const administrative = !!account && ["owner", "reception"].includes(account.role);
  const identifier = account && <div className="account-identifier">
    <code>{account.userId}</code>
    <button className="button small" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(account.userId); setCopied(true); }
      catch { setError("No se pudo copiar. Podés seleccionar el identificador y copiarlo manualmente."); }
    }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar código"}</button>
    <span className="sr-only" role="status">{copied ? "Identificador copiado" : ""}</span>
  </div>;
  const content = <main className="workspace account-home">
    <Link href={active ? portalForRole(account!.role) : "/"} className="text-link">← {active ? "Volver a mi espacio" : "Gold Gym Mercedes"}</Link>
    <header className="work-header"><div><p className="eyebrow">MI CUENTA</p><h1>{waiting ? "Un paso más para empezar." : "Tu acceso al club."}</h1><p>Sesión, permisos e identificación de tu cuenta.</p></div></header>
    {error && <div className="error-box" role="alert"><p>{error}</p><button className="button small" onClick={() => setRevision(n => n + 1)}>Volver a cargar</button></div>}
    {!account && error && <button className="button" onClick={logout} disabled={busy}>{busy ? "Cerrando…" : "Cerrar sesión"}</button>}
    {!account && !error && <section className="panel" role="status">Cargando tu acceso…</section>}
    {account && <>
      <section className="panel account-status">
        <div className="account-status-icon">{active ? <ShieldCheck size={26} /> : <Clock3 size={26} />}</div>
        <div><p className="eyebrow">{active ? "ACCESO HABILITADO" : "ESTADO DE LA CUENTA"}</p><h2>{roleLabels[account.role] ?? "Sin acceso"}</h2><p className="muted">{active ? "Tu sesión está activa. Podés continuar trabajando con tus permisos actuales." : waiting ? "Compartí este código con la administración una sola vez. Cuando habiliten tu acceso, te llevamos automáticamente a tu espacio." : "Contactá a la administración para revisar tu acceso."}</p></div>
      </section>
      {!active ? <section className="panel"><h2>Código de habilitación</h2>{identifier}<p className="muted">Identifica tu cuenta. No es una contraseña.</p></section> : <details className="panel account-details"><summary>Identificador de la cuenta</summary><p className="muted">Conservalo por si la administración necesita revisar tus permisos.</p>{identifier}</details>}
      {administrative && <section className="panel"><h2>Pantalla de ingreso por DNI</h2><p className="muted">Abrila en otra pestaña y movela al monitor de la entrada. Usa esta misma sesión; no necesita un correo ni una cuenta adicional.</p><Link className="button gold" href="/ingreso" target="_blank" rel="noopener noreferrer"><ScanLine size={18} />Abrir terminal<ArrowUpRight size={16} /></Link></section>}
      <section className="panel account-session"><div><h2>Sesión de este navegador</h2><p className="muted">Cerrar sesión también cierra el acceso de las otras pestañas, incluida la terminal.</p></div><button className="button" onClick={logout} disabled={busy}><LogOut size={17} />{busy ? "Cerrando…" : "Cerrar sesión"}</button></section>
    </>}
  </main>;
  return administrative ? <AdminShell role={account!.role}>{content}</AdminShell> : <div className="account-page">{content}</div>;
}
