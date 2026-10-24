"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { allowsActivity, type StaffScope } from "@/lib/staff-scope";
import { navigationFeatures, isFeatureRestricted } from "@/lib/features";
import "@/app/permissions.css";
import "@/app/admin-layout.css";
import {
  Users,
  CalendarDays,
  Wallet,
  Tags,
  BarChart3,
  ShieldCheck,
  Database,
  Settings,
  ScanLine,
  ArrowUpRight,
  UserRound,
  Menu,
  X,
  LockKeyhole,
} from "lucide-react";
const icons = { plans: Tags, members: Users, calendar: CalendarDays, cash: Wallet, reports: BarChart3, team: ShieldCheck, data: Database, fiscal: Wallet, settings: Settings };
export function AdminShell({
  role,
  scope,
  children,
}: {
  role: string;
  scope?: StaffScope;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Saltar al contenido
      </a>
      <aside
        className={open ? "admin-sidebar is-open" : "admin-sidebar"}
        id="admin-navigation"
      >
        <Link href="/gestion" className="admin-brand">
          <img src="/images/logo.webp" alt="" width={46} height={46} />
          <span>
            GOLD GYM<small>GESTIÓN DEL CLUB</small>
          </span>
        </Link>
        <p className="admin-nav-label">TU ESPACIO DE TRABAJO</p>
        <nav aria-label="Gestión del club">
          {navigationFeatures(role).map((feature) => {
            const { href, label, icon } = feature;
            const Icon = icons[icon];
            const outOfScope = href === "/reservas" && scope && !allowsActivity({role,...scope},"padel");
            const restricted = isFeatureRestricted(role, feature) || outOfScope;
            const lockLabel = outOfScope ? "Fuera de tu alcance" : "Solo dueños";
            return (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={restricted ? "admin-nav-restricted" : undefined}
                aria-label={restricted ? `${label}. ${lockLabel}` : undefined}
                title={restricted ? lockLabel : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} className="admin-nav-icon" aria-hidden="true" />
                <span className="admin-nav-text">{label}</span>
                {restricted && <LockKeyhole size={15} className="admin-nav-lock" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/ingreso" target="_blank" rel="noopener noreferrer">
            <ScanLine size={19} /> Terminal de ingreso{" "}
            <ArrowUpRight size={15} />
          </Link>
          <Link href="/" target="_blank" rel="noopener noreferrer">
            Ver sitio del club <ArrowUpRight size={16} />
          </Link>
          <span>Gold Gym · Mercedes</span>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            ref={toggle}
            className="admin-menu"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="admin-navigation"
            aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
          >
            {open ? <X /> : <Menu />}
          </button>
          <span>
            <i /> PANEL DEL CLUB
          </span>
          <Link href="/cuenta">
            <UserRound size={17} />
            {role === "owner" ? "Dueño" : role === "reception" ? "Recepción" : "Mi cuenta"}
            <ArrowUpRight size={14} />
          </Link>
        </header>
        <div id="admin-content" tabIndex={-1}>{children}</div>
        <footer className="admin-footer">
          Gold Gym Mercedes <span>Gestión de las cuatro sedes</span>
        </footer>
      </div>
    </div>
  );
}
