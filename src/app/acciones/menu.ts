"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { consultar, ejecutar } from "@/lib/datos/llamar";
import { ErrorApp, MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { esquemaCategoria, esquemaDisponibilidad, esquemaNombreRestaurante, esquemaProducto } from "@/lib/esquemas/menu";

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

/**
 * Borra lo creado en la demo, vuelve a cargar los datos de ejemplo y le pone el nombre del local que se va a visitar.
 * Solo restaurantes de demostración. También da de baja los avisos de los celulares que los activaron en la visita
 * anterior; `endpointDeEsteCelular` (si tiene avisos) es el único que se conserva: el de quien enseña la demo.
 */
export async function reiniciarDemo(nombre: string, endpointDeEsteCelular: string | null = null): Promise<Resultado> {
  const parsed = esquemaNombreRestaurante.safeParse(nombre);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el nombre." };
  const conservar = typeof endpointDeEsteCelular === "string" && endpointDeEsteCelular.length <= 800 ? endpointDeEsteCelular : null;
  try {
    await consultar("reiniciar_demo", { p_nombre: parsed.data, p_conservar_endpoint: conservar });
  } catch (e) {
    unstable_rethrow(e);
    // La base todavía no tiene la migración 12 (no conoce el parámetro nuevo): se reinicia como antes, sin tocar avisos.
    const sinMigracion = e instanceof ErrorApp && (e.codigo === "PGRST202" || e.codigo === "42883");
    if (!sinMigracion) return { ok: false, error: e instanceof ErrorApp ? e.message : MENSAJE_GENERICO };
    const r = await ejecutar("reiniciar_demo", { p_nombre: parsed.data });
    if (!r.ok) return r;
  }
  refrescar();
  redirect("/inicio?reiniciada=1");
}
