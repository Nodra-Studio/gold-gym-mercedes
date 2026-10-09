import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import PublicPadel from "@/components/public-padel";
export const metadata: Metadata = {
  title: "Reservar cancha de pádel · Club Unión",
  description:
    "Consultá canchas y horarios disponibles, elegí tu turno y enviá tu solicitud sin crear una cuenta.",
};
export default function Page() {
  return (
    <div className="marketing">
      <SiteHeader />
      <main id="contenido">
        <PublicPadel />
      </main>
      <SiteFooter />
    </div>
  );
}
