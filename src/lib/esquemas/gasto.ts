import { z } from "zod";
import { CATEGORIAS_GASTO } from "@/lib/gastos";

const valores = CATEGORIAS_GASTO.map((c) => c.valor) as [string, ...string[]];

export const esquemaGasto = z.object({
  monto: z.number().int("El gasto debe ser un número entero.").min(1, "Escribe cuánto fue el gasto.").max(99_999_999, "El monto es demasiado grande."),
  categoria: z.enum(valores, "Elige la categoría del gasto."),
  nota: z.string().trim().max(120, "La nota es muy larga (máximo 120 caracteres).").default(""),
  /** Ruta de la foto ya subida (<restaurante_id>/<archivo>), opcional. */
  fotoPath: z.string().trim().max(200).nullable().optional(),
  /** true = salió del efectivo de la caja (cuenta para el efectivo esperado del cierre). */
  deCaja: z.boolean().default(true),
});

export const FOTO_MAX_BYTES = 1_500_000;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
