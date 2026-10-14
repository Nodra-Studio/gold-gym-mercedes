import { z } from "zod";
import { branchIds } from "@/lib/branches";

export const fiscalConditions = ["registered", "monotributo", "exempt"] as const;
export const fiscalConditionNames: Record<(typeof fiscalConditions)[number], string> = {
  registered: "Responsable inscripto",
  monotributo: "Monotributista",
  exempt: "IVA exento",
};

export function isValidCuit(cuit: string): boolean {
  if (!/^(20|23|24|27|30|33|34)\d{9}$/.test(cuit)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(cuit[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return digit === Number(cuit[10]);
}

export const fiscalSettingsSchema = z.object({
  venue: z.enum(branchIds, { error: "Elegí una sede válida." }),
  legal_name: z.string().trim().min(2, "Ingresá la razón social.").max(200),
  tax_id: z.string().trim().max(20)
    .regex(/^(?:\d{11}|\d{2}-\d{8}-\d)$/, "Ingresá un CUIT de 11 dígitos.")
    .transform((value) => value.replaceAll("-", ""))
    .refine(isValidCuit, "Revisá el CUIT: el dígito verificador no coincide."),
  fiscal_address: z.string().trim().min(5, "Ingresá el domicilio fiscal completo.").max(300),
  tax_condition: z.enum(fiscalConditions, { error: "Elegí la condición frente al IVA." }),
  point_of_sale: z.number().int().min(1, "Ingresá el punto de venta autorizado.").max(99999),
  expectedRevision: z.number().int().min(0).max(2147483646),
}).strict();

export type FiscalIssuer = {
  id: string;
  owner: string;
  venue: (typeof branchIds)[number];
  legal_name: string;
  tax_id: string;
  fiscal_address: string;
  tax_condition: (typeof fiscalConditions)[number];
  point_of_sale: number;
  updated_at: string;
  actor: string;
  revision: number;
};

export const fiscalSelectFields = "id,owner,venue,legal_name,tax_id,fiscal_address,tax_condition,point_of_sale,updated_at,actor,revision";
