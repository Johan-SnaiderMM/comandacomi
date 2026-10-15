import { z } from "zod";

/** Entrar con correo y contraseña (el dueño de un restaurante de verdad). */
export const esquemaEntrar = z.object({
  correo: z.string().trim().toLowerCase().pipe(z.email("Escribe tu correo completo, por ejemplo nombre@gmail.com.")),
  clave: z.string().min(1, "Escribe tu contraseña.").max(72, "La contraseña es muy larga."),
});

/** Contraseña nueva: al menos 8 caracteres, escrita dos veces igual. */
export const esquemaClaveNueva = z
  .object({
    clave: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72, "La contraseña es muy larga (máximo 72)."),
    repetir: z.string(),
  })
  .refine((v) => v.clave === v.repetir, "Las dos contraseñas no son iguales.");
