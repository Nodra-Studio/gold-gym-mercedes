"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// One "S" across the band: a hump up, then a hump down (viewBox 1440 × 260).
const WAVE = "M-120 130 C 160 10 440 10 720 130 S 1280 250 1560 130";
const SPEED = 70; // viewBox units per second
const REPEATS = 5; // enough copies to cover the curve while one scrolls away
const ICON_SIZE = 34;
// Room left in the text after each word; the word's icon is drawn in the middle.
const ICON_GAP = "\u2002\u2003\u2002";

type Item = { text: string; icon: ReactNode };

// Words and icons scroll along a gold band shaped like a horizontal S.
export function WaveMarquee({ items }: { items: Item[] }) {
  const pathId = useId();
  const unit = items.map((item) => item.text + ICON_GAP).join("");
  const pathRef = useRef<SVGPathElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const textPathRef = useRef<SVGTextPathElement>(null);
  const iconRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const path = pathRef.current;
    const measurer = measureRef.current;
    if (!path || !measurer) return;
    const pathLength = path.getTotalLength();

    // Unit width and where each icon's gap is centred within one unit.
    let unitLength = 0;
    let iconCenters: number[] = [];
    const measure = () => {
      unitLength = measurer.getComputedTextLength();
      let index = 0;
      iconCenters = items.map((item) => {
        index += item.text.length;
        const start = index ? measurer.getSubStringLength(0, index) : 0;
        const gap = measurer.getSubStringLength(index, ICON_GAP.length);
        index += ICON_GAP.length;
        return start + gap / 2;
      });
    };

    let offset = 0;
    const draw = () => {
      textPathRef.current?.setAttribute("startOffset", String(offset));
      iconRefs.current.forEach((icon, i) => {
        if (!icon) return;
        const copy = Math.floor(i / items.length);
        const at = offset + copy * unitLength + iconCenters[i % items.length];
        if (!unitLength || at < 0 || at > pathLength) {
          icon.style.display = "none";
          return;
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
      });
    };

    measure();
    draw();
    document.fonts?.ready.then(() => {
      measure();
      draw();
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.min(now - last, 100) / 1000;
      last = now;
      if (unitLength > 0) {
        offset = (offset - SPEED * elapsed) % unitLength;
        draw();
      }
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [items]);

  return (
    <div
      className="wave-marquee"
      role="img"
      aria-label={items.map((item) => item.text).join(", ")}
    >
      <svg viewBox="0 0 1440 260" aria-hidden="true" focusable="false">
        <path ref={pathRef} id={pathId} d={WAVE} className="wave-marquee-band" />
        <text className="wave-marquee-text" dy="0.35em">
          <textPath ref={textPathRef} href={`#${pathId}`}>
            {unit.repeat(REPEATS)}
          </textPath>
        </text>
        {Array.from({ length: REPEATS }, (_, copy) =>
          items.map((item, i) => (
            <g
              key={`${copy}-${item.text}`}
              ref={(el) => {
                iconRefs.current[copy * items.length + i] = el;
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
          )),
        )}
        <text ref={measureRef} className="wave-marquee-text" visibility="hidden">
          {unit}
        </text>
      </svg>
    </div>
  );
}
