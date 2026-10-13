import { z } from "zod";
import { CANALES_PERSONAL } from "@/lib/push/tipos";

/** Suscripción push tal como la entrega el navegador (solo servidor). */
export const esquemaSuscripcion = z.object({
  endpoint: z.url("Este celular no pudo activar los avisos.").refine((v) => v.startsWith("https://") && v.length <= 800, "Este celular no pudo activar los avisos."),
  keys: z.object({
    p256dh: z.string().min(20, "Este celular no pudo activar los avisos.").max(200),
    auth: z.string().min(8, "Este celular no pudo activar los avisos.").max(100),
  }),
});

export const esquemaCanales = z
  .array(z.enum(CANALES_PERSONAL, "Elige qué avisos quieres recibir."))
  .min(1, "Elige qué avisos quieres recibir en este celular.")
  .max(CANALES_PERSONAL.length);
