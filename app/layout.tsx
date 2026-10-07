import type { Metadata } from "next";
import "./globals.css";
import "./renewal.css";
export const metadata: Metadata = {
  title: {
    default: "Gold Gym · Entrená en Mercedes",
    template: "%s | Gold Gym Mercedes",
  },
  description:
    "Musculación, Pilates y pádel en Mercedes, Buenos Aires. Conocé nuestras sedes y encontrá tu lugar en Gold Gym.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.jpg", shortcut: "/favicon.jpg" },
  openGraph: {
    title: "Gold Gym · Mercedes",
    description: "Tu lugar para entrenar. Tu club para encontrarte.",
    locale: "es_AR",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
