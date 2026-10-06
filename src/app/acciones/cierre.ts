"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaCierre } from "@/lib/esquemas/cierre";
import { esquemaAnulacion } from "@/lib/esquemas/pedido";

/**
 * Cierra el día de hoy. La base calcula ventas, gastos, ganancia y efectivo esperado por su cuenta
 * (no confía en cifras del celular); aquí solo viajan la base de la caja y lo que se contó.
 */
export async function cerrarDia(entrada: unknown): Promise<Resultado<{ diferencia: number }>> {
  const parsed = esquemaCierre.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el cierre." };
  const r = await ejecutar<{ diferencia: number }>("registrar_cierre", {
    p_fecha: null,
    p_base_caja: parsed.data.base,
    p_efectivo_contado: parsed.data.contado,
    p_notas: parsed.data.notas || null,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}

export async function anularCierre(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_cierre", { p_cierre_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}
