"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { benefits } from "@/lib/content";

// Partner discounts in a row that scrolls sideways: swipe on phones, arrows on desktop.
export function BenefitsCarousel() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      setAtStart(track.scrollLeft <= 4);
      setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const move = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({
      left: direction * (card.offsetWidth + gap),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <div className="benefits">
      <ul
        ref={trackRef}
        className="benefits-track"
        aria-label="Descuentos para socios"
      >
        {benefits.map((benefit) => (
          <li key={benefit.logo} className="benefit-card">
            <div className="benefit-logo">
              <img
                src={`/images/beneficios/${benefit.logo}.webp`}
                alt={benefit.name}
                loading="lazy"
              />
            </div>
            <strong className="benefit-discount">{benefit.discount}</strong>
            <span className="benefit-label">DE DESCUENTO</span>
            {benefit.details.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </li>
        ))}
      </ul>
      <div className="benefits-controls">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={atStart}
          aria-label="Ver beneficios anteriores"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={atEnd}
          aria-label="Ver más beneficios"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}
