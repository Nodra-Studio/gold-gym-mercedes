export const adminFeatures = [
  { href: "/tarifas", label: "Planes y membresías", icon: "plans", ownerOnly: false },
  { href: "/gestion", label: "Socios y gimnasio", icon: "members", ownerOnly: false },
  { href: "/reservas", label: "Agenda de pádel", icon: "calendar", ownerOnly: false },
  { href: "/caja", label: "Caja y stock", icon: "cash", ownerOnly: false },
  {
    href: "/reportes", label: "Informes", icon: "reports", ownerOnly: true,
    description: "Consultá los cobros, saldos y resultados del club por período.", preview: "reports",
  },
  {
    href: "/equipo", label: "Equipo y permisos", icon: "team", ownerOnly: true,
    description: "Administrá las personas del equipo y sus permisos de acceso al sistema.", preview: "team",
  },
  {
    href: "/datos", label: "Datos y respaldos", icon: "data", ownerOnly: true,
    description: "Importá socios y descargá o restaurá respaldos de los datos del club.", preview: "data",
  },
  {
    href: "/datos-fiscales", label: "Datos fiscales", icon: "fiscal", ownerOnly: true,
    description: "Configurá la información fiscal de cada sede para preparar la facturación.", preview: "fiscal",
  },
  {
    href: "/configuracion", label: "Configuración", icon: "settings", ownerOnly: true,
    description: "Definí las reglas generales de reservas y cancelaciones del club.", preview: "settings",
  },
] as const;

export type RestrictedAdminFeature = Extract<(typeof adminFeatures)[number], { ownerOnly: true }>;
export type RestrictedFeaturePath = RestrictedAdminFeature["href"];
export const restrictedFeatures = adminFeatures.filter((feature): feature is RestrictedAdminFeature => feature.ownerOnly);

export function navigationFeatures(role: string) {
  return role === "owner" || role === "reception" ? adminFeatures : [];
}

export function isFeatureRestricted(role: string, feature: { ownerOnly: boolean }) {
  return feature.ownerOnly && role !== "owner";
}
