import { z } from "zod";
import { AREAS } from "@/lib/areas";

/** Un rol del equipo: su nombre y lo que abre. `activo: false` lo quita (y se lo quita a quienes lo tenían). */
export const esquemaRol = z
  .object({
    id: z.uuid().nullable().default(null),
    nombre: z.string().trim().min(1, "Escribe el nombre del rol.").max(30, "El nombre es muy largo (máximo 30 caracteres)."),
    areas: z.array(z.enum(AREAS, "Ese permiso no existe.")).max(AREAS.length),
    activo: z.boolean().default(true),
  })
  .refine((v) => !v.activo || v.areas.length > 0, "Elige al menos una cosa que pueda hacer este rol.");

/** Los roles de una persona del equipo (reemplaza los que tenía; [] = ninguno). */
export const esquemaAsignacion = z.object({
  userId: z.uuid("La persona no es válida."),
  roles: z.array(z.uuid("El rol no es válido.")).max(12),
});

/** Invitar a alguien al equipo: su nombre y al menos un rol. */
export const esquemaInvitacion = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la persona.").max(40, "El nombre es muy largo (máximo 40 caracteres)."),
  roles: z.array(z.uuid("El rol no es válido.")).min(1, "Elige al menos un rol: sin roles no podría hacer nada.").max(12),
});

export const esquemaUuid = z.uuid();
