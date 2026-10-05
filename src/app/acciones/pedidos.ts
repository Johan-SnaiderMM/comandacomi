"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaAnulacion, esquemaCambioEstado, esquemaEnvio } from "@/lib/esquemas/pedido";

/** Después de cambiar datos se refrescan todas las pantallas (insignia de pendientes, Inicio, listas). */
function refrescar() {
  revalidatePath("/", "layout");
}

type Enviado = { numero: number; total: number; agregado: boolean };

/** Enviar a cocina: crea el pedido (o agrega platos a uno abierto de la mesa). Los precios los lee la base. */
export async function enviarPedido(entrada: unknown): Promise<Resultado<Enviado>> {
  const parsed = esquemaEnvio.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el pedido." };
  const v = parsed.data;
  const items = v.items.map((i) => ({
    producto_id: i.productoId,
    cantidad: i.cantidad,
    adiciones: i.adiciones,
    notas: i.notas || null,
  }));

  if (v.agregarA) {
    const r = await ejecutar<{ numero: number; total: number }>("agregar_items_pedido", { p_pedido_id: v.agregarA, p_items: items });
    if (!r.ok) return r;
    refrescar();
    return { ok: true, datos: { numero: r.datos.numero, total: r.datos.total, agregado: true } };
  }

  const r = await ejecutar<{ numero: number; total: number }>("crear_pedido", {
    p_tipo: v.tipo,
    p_mesa_id: v.tipo === "mesa" ? v.mesaId : null,
    p_items: items,
    p_contacto_nombre: v.contactoNombre || null,
    p_contacto_telefono: v.contactoTelefono || null,
    p_direccion: v.tipo === "domicilio" ? v.direccion : null,
    p_notas: v.notas || null,
  });
  if (!r.ok) return r;
  refrescar();
  return { ok: true, datos: { numero: r.datos.numero, total: r.datos.total, agregado: false } };
}

export async function cambiarEstado(pedidoId: string, estado: string): Promise<Resultado> {
  const parsed = esquemaCambioEstado.safeParse({ pedidoId, estado });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("cambiar_estado_pedido", { p_pedido_id: parsed.data.pedidoId, p_estado: parsed.data.estado });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}

export async function anularPedido(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_pedido", { p_pedido_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}

export async function anularCobro(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_cobro", { p_pedido_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  refrescar();
  return { ok: true };
}
