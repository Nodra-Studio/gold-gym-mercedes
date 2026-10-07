export const branches = [
  { id: "calle30", name: "Calle 30" },
  { id: "calle23", name: "Calle 23" },
  { id: "velez", name: "Club Vélez · gimnasio y pádel" },
  { id: "pilates", name: "Pilates" },
] as const;
export const branchIds = ["calle30", "calle23", "velez", "pilates"] as const;
export const branchName = (id: string | null) =>
  branches.find((b) => b.id === id)?.name ?? "Sin sede registrada";
export const expenseCategories = [
  "Limpieza",
  "Electricidad",
  "Reparaciones",
  "Mercadería",
  "Alquiler",
  "Servicios",
  "Otros",
] as const;
