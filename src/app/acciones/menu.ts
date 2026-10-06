"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaCategoria, esquemaDisponibilidad, esquemaProducto } from "@/lib/esquemas/menu";

function refrescar() {
  revalidatePath("/", "layout");
}

/** Crea o edita un plato (solo el dueño). `activo: false` lo quita del menú sin borrarlo. */
export async function guardarProducto(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = esquemaProducto.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el plato." };
  const v = parsed.data;
  const r = await ejecutar<{ id: string }>("guardar_producto", {
    p_id: v.id,
    p_categoria_id: v.categoriaId,
    p_nombre: v.nombre,
    p_precio: v.precio,
    p_disponible: v.disponible,
    p_activo: v.activo,
  });
  if (!r.ok) return r;
  refrescar();
  return r;
}

export async function guardarCategoria(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = esquemaCategoria.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la categoría." };
  const v = parsed.data;
  const r = await ejecutar<{ id: string }>("guardar_categoria", {
    p_id: v.id,
    p_nombre: v.nombre,
    p_icono: v.icono || null,
    p_activa: v.activa,
  });
  if (!r.ok) return r;
  refrescar();
  return r;
}

/** "Se acabó" / "Ya hay": un toque, lo puede hacer cualquiera del equipo. */
export async function cambiarDisponibilidad(productoId: string, disponible: boolean): Promise<Resultado> {
  const parsed = esquemaDisponibilidad.safeParse({ productoId, disponible });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("cambiar_disponibilidad", { p_producto_id: parsed.data.productoId, p_disponible: parsed.data.disponible });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}

/** Borra lo creado en la demo y vuelve a cargar los datos de ejemplo. Solo restaurantes de demostración. */
export async function reiniciarDemo(): Promise<Resultado> {
  const r = await ejecutar("reiniciar_demo");
  if (!r.ok) return r;
  refrescar();
  redirect("/inicio?reiniciada=1");
}
