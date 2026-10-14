import { accessForMemberships, localDay, requestId } from "@/lib/club";

export const OFFLINE_KEY = "gold-terminal-offline-v1";
export const OFFLINE_HOURS = 8;
export const OFFLINE_QUEUE_LIMIT = 2000;
export const terminalVenues = ["Calle 30", "Calle 23", "Club Unión", "Pilates"] as const;
export type OfflineMembership = { status: string; expires: string; access_scope: string };
export type OfflineEntry = { dniHash: string; memberships: OfflineMembership[] };
export type OfflineSnapshot = {
  id: string; deviceId: string; preparedBy: string; venue: string;
  preparedAt: string; expiresAt: string; salt: string; entries: OfflineEntry[];
};
export type OfflineEvent = { id: string; snapshotId: string; dniHash: string; observedAt: string };
export type TerminalOfflineStore = {
  version: 1; deviceId: string; snapshot: OfflineSnapshot | null;
  events: OfflineEvent[]; lastSeenAt: string;
};

export async function hashTerminalDni(salt: string, dni: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${dni}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function snapshotUsable(snapshot: OfflineSnapshot | null, venue: string, now = new Date(), lastSeenAt?: string) {
  const time = now.getTime();
  return !!snapshot && snapshot.venue === venue &&
    Number.isFinite(Date.parse(snapshot.preparedAt)) && Number.isFinite(Date.parse(snapshot.expiresAt)) &&
    time >= Date.parse(snapshot.preparedAt) - 60000 && time < Date.parse(snapshot.expiresAt) &&
    (!lastSeenAt || time >= Date.parse(lastSeenAt) - 60000);
}
export function offlineDecision(snapshot: OfflineSnapshot, dniHash: string, now = new Date()) {
  const entry = snapshot.entries.find(item => item.dniHash === dniHash);
  return accessForMemberships(entry?.memberships ?? [], localDay(now), snapshot.venue);
}
export function readTerminalOffline(): TerminalOfflineStore | null {
  const raw = localStorage.getItem(OFFLINE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TerminalOfflineStore;
    if (value.version !== 1 || typeof value.deviceId !== "string" || !Array.isArray(value.events) ||
        typeof value.lastSeenAt !== "string" || value.events.length > OFFLINE_QUEUE_LIMIT ||
        (value.snapshot && (!Array.isArray(value.snapshot.entries) || value.snapshot.deviceId !== value.deviceId)))
      throw new Error("Invalid terminal storage");
    return value;
  } catch {
    localStorage.removeItem(OFFLINE_KEY);
    return null;
  }
}
export function writeTerminalOffline(value: TerminalOfflineStore) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(value));
}
export function newTerminalOffline(): TerminalOfflineStore {
  return { version: 1, deviceId: requestId(), snapshot: null, events: [], lastSeenAt: new Date().toISOString() };
}
export async function terminalStorageLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error("Este navegador no permite guardar ingresos offline con seguridad. Usá una versión actual de Chrome, Edge, Firefox o Safari.");
  return navigator.locks.request("gold-terminal-offline-storage", work);
}
export async function clearTerminalOffline() {
  const remove = async () => {
    try { localStorage.removeItem(OFFLINE_KEY); localStorage.removeItem("gold-terminal-venue"); }
    catch { /* A storage restriction must never prevent signing out. */ }
  };
  if (navigator.locks) await navigator.locks.request("gold-terminal-offline-storage", remove);
  else await remove();
  window.dispatchEvent(new Event("gold-terminal-cleared"));
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(r => new URL(r.scope).pathname.replace(/\/$/, '') === "/ingreso").map(r => r.unregister()));
  }
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("gold-terminal-shell-")).map(name => caches.delete(name)));
  }
}

/** Only queues facts supplied by this device; the server reconstructs the decision. */
export async function recordOfflineLookup(venue: string, dni: string) {
  return terminalStorageLock(async () => {
    const value = readTerminalOffline();
    const now = new Date();
    if (!value || !snapshotUsable(value.snapshot, venue, now, value.lastSeenAt)) {
      if (value) { value.snapshot = null; writeTerminalOffline(value); }
      throw new Error("La copia offline venció o no corresponde a esta sede. Continuá el control manual en recepción.");
    }
    if (value.events.length >= OFFLINE_QUEUE_LIMIT) throw new Error("La terminal tiene 2000 consultas pendientes. Conectala para sincronizar o continuá el control manual en recepción.");
    const snapshot = value.snapshot!;
    const dniHash = await hashTerminalDni(snapshot.salt, dni);
    const event = { id: requestId(), snapshotId: snapshot.id, dniHash, observedAt: now.toISOString() };
    value.events.push(event);
    value.lastSeenAt = now.toISOString();
    writeTerminalOffline(value);
    return { decision: offlineDecision(snapshot, dniHash, now), store: value };
  });
}
