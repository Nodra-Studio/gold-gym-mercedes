"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// One "S" across the band: a hump up, then a hump down (viewBox 1440 × 260).
const WAVE = "M-120 130 C 160 10 440 10 720 130 S 1280 250 1560 130";
const SPEED = 70; // viewBox units per second
const REPEATS = 5; // enough copies to cover the curve while one scrolls away
const ICON_SIZE = 34;
const ICON_PADDING = 20; // space on each side of an icon, in viewBox units

type Item = { text: string; icon: ReactNode };

// Words and icons scroll along a gold band shaped like a horizontal S.
// Every word and icon is placed on the curve on its own, so a browser that
// measures text slightly differently (Safari) can't make them run into each other.
export function WaveMarquee({ items }: { items: Item[] }) {
  const pathId = useId();
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const measureRefs = useRef<(SVGTextElement | null)[]>([]);
  const wordRefs = useRef<(SVGTextPathElement | null)[]>([]);
  const iconRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const pathLength = path.getTotalLength();
    const slot = ICON_SIZE + ICON_PADDING * 2;

    // Where each word starts and each icon is centred within one copy.
    let unitLength = 0;
    let wordStarts: number[] = [];
    let iconCenters: number[] = [];
    const measure = () => {
      let position = 0;
      wordStarts = [];
      iconCenters = [];
      items.forEach((_, i) => {
        wordStarts.push(position);
        position += measureRefs.current[i]?.getComputedTextLength() ?? 0;
        iconCenters.push(position + slot / 2);
        position += slot;
      });
      unitLength = position;
    };

    let offset = offsetRef.current;
    const draw = () => {
      for (let n = 0; n < REPEATS * items.length; n++) {
        const copyStart = offset + Math.floor(n / items.length) * unitLength;
        const i = n % items.length;
        wordRefs.current[n]?.setAttribute(
          "startOffset",
          String(copyStart + wordStarts[i]),
        );

        const icon = iconRefs.current[n];
        if (!icon) continue;
        const at = copyStart + iconCenters[i];
        if (!unitLength || at < 0 || at > pathLength) {
          icon.style.display = "none";
          continue;
        }
        const point = path.getPointAtLength(at);
        const ahead = path.getPointAtLength(Math.min(at + 1, pathLength));
        const angle =
          (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
        icon.setAttribute(
          "transform",
          `translate(${point.x} ${point.y}) rotate(${angle})`,
        );
        icon.style.display = "";
      }
    };

    let disposed = false;
    measure();
    draw();
    document.fonts?.ready.then(() => {
      if (!disposed) {
        measure();
        draw();
      }
    });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 64) / 1000;
      last = now;
      if (unitLength > 0) {
        offset = (offset - SPEED * elapsed) % unitLength;
        offsetRef.current = offset;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (!paused && !preference.matches && visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? false;
            sync();
          })
        : null;
    if (containerRef.current) observer?.observe(containerRef.current);
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [items, paused]);

  return (
    <div className="wave-marquee" ref={containerRef}>
      <svg
        viewBox="0 0 1440 260"
        role="img"
        aria-label={items.map((item) => item.text).join(", ")}
        focusable="false"
      >
        <path
          ref={pathRef}
          id={pathId}
          d={WAVE}
          className="wave-marquee-band"
        />
        {Array.from({ length: REPEATS }, (_, copy) =>
          items.map((item, i) => {
            const n = copy * items.length + i;
            return (
              <g key={`${copy}-${item.text}`}>
                <text className="wave-marquee-text" dy="0.35em">
                  <textPath
                    ref={(el) => {
                      wordRefs.current[n] = el;
                    }}
                    href={`#${pathId}`}
                    startOffset={-10000}
                  >
                    {item.text}
                  </textPath>
                </text>
                <g
                  ref={(el) => {
                    iconRefs.current[n] = el;
                  }}
                  className="wave-marquee-icon"
                  style={{ display: "none" }}
                >
                  <svg
                    x={-ICON_SIZE / 2}
                    y={-ICON_SIZE / 2}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    viewBox="0 0 24 24"
                  >
                    {item.icon}
                  </svg>
                </g>
              </g>
            );
          }),
        )}
        {items.map((item, i) => (
          <text
            key={item.text}
            ref={(el) => {
              measureRefs.current[i] = el;
            }}
            className="wave-marquee-text"
            visibility="hidden"
          >
            {item.text}
          </text>
        ))}
      </svg>
      <button
        type="button"
        className="wave-motion-toggle"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
        aria-label={
          paused
            ? "Reanudar animación de la franja"
            : "Pausar animación de la franja"
        }
      >
        {paused ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 11 7-11 7Z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
