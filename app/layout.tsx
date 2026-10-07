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
      <head>
        <link
          rel="preload"
          href="/fonts/manrope-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/manrope-600.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/barlow-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
