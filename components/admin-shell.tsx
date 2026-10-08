"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Users,
  CalendarDays,
  Wallet,
  BarChart3,
  ShieldCheck,
  Database,
  Settings,
  ScanLine,
  ArrowUpRight,
  UserRound,
  Menu,
  X,
} from "lucide-react";
const links = [
  { href: "/gestion", label: "Socios y gimnasio", icon: Users },
  { href: "/reservas", label: "Agenda de pádel", icon: CalendarDays },
  { href: "/caja", label: "Caja y stock", icon: Wallet },
  { href: "/reportes", label: "Informes", icon: BarChart3, owner: true },
  {
    href: "/equipo",
    label: "Equipo y permisos",
    icon: ShieldCheck,
    owner: true,
  },
  { href: "/datos", label: "Datos y respaldos", icon: Database, owner: true },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: Settings,
    owner: true,
  },
];
export function AdminShell({
  role,
  children,
}: {
  role: string;
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
          {links
            .filter((l) => !l.owner || role === "owner")
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            ))}
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
            {role === "owner" ? "Administración" : "Recepción"}
            <ArrowUpRight size={14} />
          </Link>
        </header>
        <div id="admin-content">{children}</div>
        <footer className="admin-footer">
          Gold Gym Mercedes <span>Gestión de las cuatro sedes</span>
        </footer>
      </div>
    </div>
  );
}
