"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaHorario } from "@/lib/esquemas/horario";
import { esquemaAnulacion } from "@/lib/esquemas/pedido";
import { alAceptarPedido, alRechazarPedido } from "@/lib/push/eventos";

// Acciones del PERSONAL sobre los pedidos que hacen los clientes en línea (piden sesión, como todo lo del personal).

const esquemaAceptar = z.object({
  pedidoId: z.uuid("El pedido no es válido."),
  minutos: z.number().int("El tiempo debe ser un número entero de minutos.").min(1, "El tiempo mínimo es 1 minuto.").max(240, "El tiempo máximo es 240 minutos.").nullable(),
});

/** Aceptar: el pedido pasa a la cocina (Pendientes y plancha). `minutos` es el tiempo estimado que verá el cliente. */
export async function aceptarPedidoCliente(pedidoId: string, minutos: number | null): Promise<Resultado> {
  const parsed = esquemaAceptar.safeParse({ pedidoId, minutos });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("confirmar_pedido_cliente", { p_pedido_id: parsed.data.pedidoId, p_minutos: parsed.data.minutos });
  if (!r.ok) return r;
  after(() => alAceptarPedido(parsed.data.pedidoId, parsed.data.minutos)); // a la parrilla y al cliente
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Rechazar: queda anulado con el motivo, y el cliente lo ve en su seguimiento. */
export async function rechazarPedidoCliente(pedidoId: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id: pedidoId, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_pedido", { p_pedido_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  after(() => alRechazarPedido(parsed.data.id, parsed.data.motivo)); // al cliente, con el motivo
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Guarda el horario de atención de los pedidos en línea (solo el dueño): se abren y se cierran solos a esas horas.
 * `null` lo quita y vuelve a mandar solo el interruptor.
 */
export async function configurarHorario(horario: unknown): Promise<Resultado> {
  const parsed = esquemaHorario.safeParse(horario);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el horario." };
  const r = await ejecutar("configurar_horario", { p_horario: parsed.data });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Abrir o cerrar la recepción de pedidos en línea (solo el dueño). */
export async function configurarPedidosEnLinea(activo: boolean): Promise<Resultado> {
  if (typeof activo !== "boolean") return { ok: false, error: "Indica si se reciben pedidos en línea." };
  const r = await ejecutar("configurar_pedidos_en_linea", { p_activo: activo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}
