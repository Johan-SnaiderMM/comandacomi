import { z } from "zod";

const hora = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Escribe la hora como 18:30.");

const franja = z
  .object({ abre: hora, cierra: hora })
  .refine((f) => f.abre !== f.cierra, "La hora de abrir y la de cerrar no pueden ser la misma.");

/**
 * Horario de atención: 7 posiciones (0 = domingo); cada una null (no se atiende) o { abre, cierra }. null = sin horario.
 * La base vuelve a validarlo (fn_horario_valido): esto solo le ahorra el viaje a un dato mal formado.
 */
export const esquemaHorario = z
  .array(franja.nullable())
  .length(7, "El horario debe traer los siete días.")
  .refine((dias) => dias.some((d) => d !== null), "Marca al menos un día de atención, o quita el horario.")
  .nullable();
