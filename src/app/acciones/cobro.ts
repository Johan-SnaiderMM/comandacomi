"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaCobro } from "@/lib/esquemas/cobro";

export type Cobrado = { numero: number; total: number; propina: number; cobrado: number; vuelto: number; fiado: number };

/**
 * Cobra un pedido. La base valida que los pagos sumen exactamente total + propina y calcula el vuelto;
 * aquí solo se valida la forma de los datos.
 */
export async function cobrarPedido(entrada: unknown): Promise<Resultado<Cobrado>> {
  const parsed = esquemaCobro.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el cobro." };
  const { pedidoId, propina, pagos } = parsed.data;

  const r = await ejecutar<Cobrado>("cobrar_pedido", {
    p_pedido_id: pedidoId,
    p_propina: propina,
    p_pagos: pagos.map((p) => ({
      medio: p.medio,
      monto: p.monto,
      recibido: p.medio === "efectivo" ? (p.recibido ?? p.monto) : undefined,
      referencia: p.medio === "transferencia" ? p.referencia || undefined : undefined,
      cliente_id: p.medio === "fiado" ? p.clienteId : undefined,
    })),
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}
