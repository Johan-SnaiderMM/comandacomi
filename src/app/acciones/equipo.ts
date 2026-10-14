"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { inicioDe, type Area, type VerComo } from "@/lib/areas";
import { consultar, ejecutar } from "@/lib/datos/llamar";
import type { Equipo } from "@/lib/datos/tipos";
import { ErrorApp, MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { esquemaAsignacion, esquemaInvitacion, esquemaRol, esquemaUuid } from "@/lib/esquemas/equipo";
import { COOKIE_VER_COMO } from "@/lib/permisos";

function refrescar() {
  revalidatePath("/", "layout");
}

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
  refrescar();
  return r;
}

/** Los roles de una persona del equipo. Solo el dueño. Devuelve lo que esa persona queda abriendo. */
export async function asignarRoles(entrada: unknown): Promise<Resultado<{ areas: Area[] }>> {
  const parsed = esquemaAsignacion.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los roles." };
  const r = await ejecutar<{ areas: Area[] }>("asignar_roles", { p_user_id: parsed.data.userId, p_roles: parsed.data.roles });
  if (!r.ok) return r;
  refrescar();
  return r;
}

/** Invitar a alguien: la base da un código de un uso que sirve 48 horas (ver migración 20). Solo el dueño. */
export async function crearInvitacion(entrada: unknown): Promise<Resultado<{ id: string; codigo: string; nombre: string; expira_at: string }>> {
  const parsed = esquemaInvitacion.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la invitación." };
  const r = await ejecutar<{ id: string; codigo: string; nombre: string; expira_at: string }>("crear_invitacion", {
    p_nombre: parsed.data.nombre,
    p_roles: parsed.data.roles,
  });
  if (!r.ok) return r;
  refrescar();
  return r;
}

export async function anularInvitacion(id: string): Promise<Resultado> {
  const parsed = esquemaUuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "La invitación no es válida." };
  const r = await ejecutar("anular_invitacion", { p_id: parsed.data });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}

/** Quitar a alguien del equipo: su celular pierde el acceso al instante. Solo el dueño. */
export async function quitarDelEquipo(userId: string): Promise<Resultado> {
  const parsed = esquemaUuid.safeParse(userId);
  if (!parsed.success) return { ok: false, error: "La persona no es válida." };
  const r = await ejecutar("quitar_del_equipo", { p_user_id: parsed.data });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}

/**
 * "Ver como": el dueño mira la app como la ve un rol, en ESTE celular. Solo cambia lo que se muestra (la base lo sigue
 * tratando como dueño). Se busca el rol en el equipo (eso ya exige ser el dueño) y se guarda su nombre y sus áreas.
 */
export async function verComo(rolId: string): Promise<Resultado> {
  const parsed = esquemaUuid.safeParse(rolId);
  if (!parsed.success) return { ok: false, error: "El rol no es válido." };
  let equipo: Equipo;
  try {
    equipo = await consultar<Equipo>("listar_equipo");
  } catch (e) {
    return { ok: false, error: e instanceof ErrorApp ? e.message : MENSAJE_GENERICO };
  }
  const rol = equipo.roles.find((r) => r.id === parsed.data);
  if (!rol) return { ok: false, error: "El rol no existe." };
  const valor: VerComo = { nombre: rol.nombre, areas: rol.areas };
  (await cookies()).set(COOKIE_VER_COMO, JSON.stringify(valor), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  refrescar();
  redirect(inicioDe({ areas: rol.areas, esDueno: false }));
}

/** Volver a ver la app como dueño. */
export async function dejarDeVerComo(): Promise<void> {
  (await cookies()).delete(COOKIE_VER_COMO);
  refrescar();
  redirect("/mas");
}
