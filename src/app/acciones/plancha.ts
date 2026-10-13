"use server";

import { z } from "zod";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoPedido } from "@/lib/datos/tipos";
import type { Resultado } from "@/lib/errores";

// Acciones de la plancha. No revalidan toda la app: el panel se actualiza solo (consulta cada pocos segundos) y los
// demás dispositivos se enteran en su próxima consulta.

export type ProgresoPedido = { pedido_id: string; estado: EstadoPedido; items_listos: number; items_total: number };

const esquemaItem = z.object({ itemId: z.uuid("El plato no es válido."), listo: z.boolean() });
const esquemaPedido = z.object({ pedidoId: z.uuid("El pedido no es válido.") });

/** Marca (o desmarca) UN plato. Con el último plato listo el pedido pasa solo a "listo". */
export async function marcarItemListo(itemId: string, listo: boolean): Promise<Resultado<ProgresoPedido>> {
  const parsed = esquemaItem.safeParse({ itemId, listo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  return ejecutar<ProgresoPedido>("marcar_item_listo", { p_item_id: parsed.data.itemId, p_listo: parsed.data.listo });
}

/** "Todo listo": marca de una vez todos los platos del pedido. */
export async function marcarPedidoListo(pedidoId: string): Promise<Resultado> {
  const parsed = esquemaPedido.safeParse({ pedidoId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("cambiar_estado_pedido", { p_pedido_id: parsed.data.pedidoId, p_estado: "listo" });
  return r.ok ? { ok: true } : r;
}

/** Deshacer un "todo listo": el pedido vuelve a pendiente y sus platos a por preparar. */
export async function deshacerPedidoListo(pedidoId: string): Promise<Resultado> {
  const parsed = esquemaPedido.safeParse({ pedidoId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("cambiar_estado_pedido", { p_pedido_id: parsed.data.pedidoId, p_estado: "pendiente" });
  return r.ok ? { ok: true } : r;
}
