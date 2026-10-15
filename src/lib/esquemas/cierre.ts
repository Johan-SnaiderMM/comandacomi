import { z } from "zod";

export const esquemaCierre = z.object({
  base: z.number().int("La base debe ser un número entero.").min(0, "La base de la caja no es válida.").max(99_999_999, "La base es demasiado grande."),
  contado: z.number().int("Lo contado debe ser un número entero.").min(0, "Escribe cuánto efectivo contaste.").max(99_999_999, "El valor es demasiado grande."),
  notas: z.string().trim().max(200, "La nota es muy larga (máximo 200 caracteres).").default(""),
  /** null = el día de trabajo. Con fecha: un día anterior que quedó sin cerrar (la base no deja cerrar uno futuro). */
  fecha: z.iso.date("La fecha del cierre no es válida.").nullable().default(null),
});
