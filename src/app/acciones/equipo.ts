"use server";

import { revalidatePath } from "next/cache";
import type { Area } from "@/lib/areas";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaAsignacion, esquemaRol } from "@/lib/esquemas/equipo";

/** Crea, cambia o quita (`activo: false`) un rol del equipo. Solo el dueño (la base lo exige). */
export async function guardarRol(entrada: unknown): Promise<Resultado<{ id: string; recuperado?: boolean }>> {
  const parsed = esquemaRol.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el rol." };
  const v = parsed.data;
  const r = await ejecutar<{ id: string; recuperado?: boolean }>("guardar_rol_equipo", {
    p_id: v.id,
    p_nombre: v.nombre,
    p_areas: v.areas,
    p_activo: v.activo,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}

/** Los roles de una persona del equipo. Solo el dueño. Devuelve lo que esa persona queda abriendo. */
export async function asignarRoles(entrada: unknown): Promise<Resultado<{ areas: Area[] }>> {
  const parsed = esquemaAsignacion.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los roles." };
  const r = await ejecutar<{ areas: Area[] }>("asignar_roles", { p_user_id: parsed.data.userId, p_roles: parsed.data.roles });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}
