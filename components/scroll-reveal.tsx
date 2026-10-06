"use client";

import { useEffect } from "react";

// Animates [data-reveal] elements in as they scroll into view. Elements are only
// hidden once this runs, so the content stays visible without JavaScript or
// when the visitor asked for reduced motion.
export function ScrollReveal() {
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    root.classList.add("reveal-ready");
    document
      .querySelectorAll<HTMLElement>("[data-reveal]:not(.is-revealed)")
      .forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
