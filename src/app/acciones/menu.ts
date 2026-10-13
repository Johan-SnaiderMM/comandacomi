"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { consultar, ejecutar } from "@/lib/datos/llamar";
import { ErrorApp, MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { esquemaAdicion, esquemaCategoria, esquemaDisponibilidad, esquemaMesa, esquemaNombreRestaurante, esquemaPin, esquemaProducto } from "@/lib/esquemas/menu";

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
    p_se_prepara: v.sePrepara,
  });
  if (!r.ok) return r;
  refrescar();
  return r;
}

/** Crea, edita o quita (`activo: false`) una adición. Solo el dueño. */
export async function guardarAdicion(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = esquemaAdicion.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la adición." };
  const v = parsed.data;
  const r = await ejecutar<{ id: string }>("guardar_modificador", {
    p_id: v.id,
    p_categoria_id: v.categoriaId,
    p_nombre: v.nombre,
    p_precio_extra: v.precioExtra,
    p_activo: v.activo,
  });
  if (!r.ok) return r;
  refrescar();
  return r;
}

/** Crea, renombra o quita (`activa: false`) una mesa. Solo el dueño. */
export async function guardarMesa(entrada: unknown): Promise<Resultado<{ id: string; recuperada?: boolean }>> {
  const parsed = esquemaMesa.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la mesa." };
  const v = parsed.data;
  const r = await ejecutar<{ id: string; recuperada?: boolean }>("guardar_mesa", { p_id: v.id, p_nombre: v.nombre, p_activa: v.activa });
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
 *
 * Si la demo tiene PIN (lo define quien administra la base), la base lo exige: un PIN equivocado no reinicia nada y, a
 * los cinco intentos, bloquea el reinicio unos minutos. El PIN nunca se guarda ni se compara aquí: solo viaja.
 */
export async function reiniciarDemo(nombre: string, endpointDeEsteCelular: string | null = null, pin = ""): Promise<Resultado> {
  const parsed = esquemaNombreRestaurante.safeParse(nombre);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el nombre." };
  const pinLimpio = esquemaPin.safeParse(pin);
  if (!pinLimpio.success) return { ok: false, error: pinLimpio.error.issues[0]?.message ?? "Revisa el PIN." };
  const conservar = typeof endpointDeEsteCelular === "string" && endpointDeEsteCelular.length <= 800 ? endpointDeEsteCelular : null;

  // De la base más nueva a la más vieja: si todavía no tiene la migración 15 (PIN) o la 12 (avisos), no conoce esos
  // parámetros y se reinicia con los que sí conoce.
  const intentos: Record<string, unknown>[] = [
    { p_nombre: parsed.data, p_conservar_endpoint: conservar, p_pin: pinLimpio.data || null },
    { p_nombre: parsed.data, p_conservar_endpoint: conservar },
    { p_nombre: parsed.data },
  ];
  let respuesta: RespuestaReinicio | null = null;
  for (const [i, args] of intentos.entries()) {
    try {
      respuesta = await consultar<RespuestaReinicio | null>("reiniciar_demo", args);
      break;
    } catch (e) {
      unstable_rethrow(e);
      const sinMigracion = e instanceof ErrorApp && (e.codigo === "PGRST202" || e.codigo === "42883");
      if (!sinMigracion || i === intentos.length - 1) return { ok: false, error: e instanceof ErrorApp ? e.message : MENSAJE_GENERICO };
    }
  }
  if (respuesta && respuesta.ok === false) return { ok: false, error: mensajeDeReinicioRechazado(respuesta) };
  refrescar();
  redirect("/inicio?reiniciada=1");
}

type RespuestaReinicio = { ok: boolean; motivo?: "pin" | "bloqueado"; minutos?: number; intentos_restantes?: number };

function mensajeDeReinicioRechazado(r: RespuestaReinicio): string {
  if (r.motivo === "bloqueado") {
    const min = r.minutos ?? 5;
    return `Demasiados intentos con el PIN equivocado. Espera ${min} ${min === 1 ? "minuto" : "minutos"} y vuelve a intentar.`;
  }
  const quedan = r.intentos_restantes ?? 0;
  return `El PIN no es correcto. ${quedan === 1 ? "Queda 1 intento" : `Quedan ${quedan} intentos`} antes de que se bloquee.`;
}
