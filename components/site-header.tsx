"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandIcon } from "@/components/brand-icon";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { brand } from "@/lib/content";
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="gg-header">
        <Link
          className="gg-brand"
          href="/"
          aria-label="Gold Gym Mercedes, inicio"
        >
          <img src="/images/logo.webp" alt="" width={52} height={52} />
          <span>
            GOLD GYM<small>MERCEDES</small>
          </span>
        </Link>
        <button
          ref={toggle}
          className="gg-menu"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-controls="gold-navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="gold-navigation"
          className={open ? "gg-nav is-open" : "gg-nav"}
          aria-label="Principal"
        >
          <Link href="/#actividades" onClick={() => setOpen(false)}>
            Actividades
          </Link>
          <Link href="/#sedes" onClick={() => setOpen(false)}>
            Sedes
          </Link>
          <Link href="/pilates" aria-current={path === "/pilates" ? "page" : undefined} onClick={() => setOpen(false)}>
            Pilates
          </Link>
          <Link href="/padel" aria-current={path === "/padel" ? "page" : undefined} onClick={() => setOpen(false)}>
            Pádel
          </Link>
          <Link href="/club" aria-current={path === "/club" ? "page" : undefined} onClick={() => setOpen(false)}>
            Cómo sumarte
          </Link>
          <a
            className="gg-button gg-nav-cta"
            href={brand.contact}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon name="whatsapp" /> Empezá hoy
          </a>
        </nav>
      </header>
    </>
  );
}
