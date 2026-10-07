"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageCircle, UserRound, Menu, X } from "lucide-react";
import { brand } from "@/lib/content";
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <img src="/images/logo.webp" alt="Gold Gym" width="56" height="56" />
        <span>
          GOLD GYM<small>MERCEDES</small>
        </span>
      </Link>
      <button
        className="menu-toggle"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        className={open ? "site-nav open" : "site-nav"}
        aria-label="Principal"
      >
        <Link onClick={() => setOpen(false)} href="/#entrena">
          Entrená
        </Link>
        <Link onClick={() => setOpen(false)} href="/#sedes">
          Sedes
        </Link>
        <Link onClick={() => setOpen(false)} href="/pilates">
          Pilates
        </Link>
        <Link onClick={() => setOpen(false)} href="/padel">
          Pádel
        </Link>
        <Link onClick={() => setOpen(false)} href="/club"><UserRound size={16} aria-hidden="true" /> El club</Link>
        <a
          className="button gold small"
          href={brand.contact}
          target="_blank"
          rel="noopener noreferrer"
        >
          Sumate a Gold <MessageCircle size={16} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}

