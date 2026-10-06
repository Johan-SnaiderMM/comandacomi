"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaAnulacion } from "@/lib/esquemas/pedido";

// Crear, mover y cobrar pedidos pasa por aplicar_operacion (acciones/sync.ts): funciona con y sin señal.
// Aquí quedan las anulaciones, que necesitan señal (dependen de lo que ya está en el servidor).

export async function anularPedido(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_pedido", { p_pedido_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function anularCobro(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_cobro", { p_pedido_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}
