/** Official brand silhouettes, tinted consistently with the surrounding link. */
export function BrandIcon({ name }: { name: "instagram" | "whatsapp" }) {
  return (
    <span
      aria-hidden="true"
      className="gg-brand-icon"
      style={{
        maskImage: `url(/icons/${name}.svg)`,
        WebkitMaskImage: `url(/icons/${name}.svg)`,
      }}
    />
  );
}
