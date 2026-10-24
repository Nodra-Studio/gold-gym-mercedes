import type { Metadata } from "next";
import ClubDashboard from "@/components/club-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gestión del club",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ClubDashboard />;
}
