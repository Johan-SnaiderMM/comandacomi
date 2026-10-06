"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaAbono, esquemaCliente } from "@/lib/esquemas/cobro";
import { esquemaAnulacion } from "@/lib/esquemas/pedido";

export type ClienteNuevo = { id: string; nombre: string; telefono: string | null };

export async function crearCliente(nombre: string, telefono: string): Promise<Resultado<ClienteNuevo>> {
  const parsed = esquemaCliente.safeParse({ nombre, telefono });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar<ClienteNuevo>("crear_cliente", {
    p_nombre: parsed.data.nombre,
    p_telefono: parsed.data.telefono || null,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}

/** Abono a la deuda de un cliente. La base no deja pasarse del saldo. Devuelve el saldo que queda. */
export async function registrarAbono(entrada: unknown): Promise<Resultado<{ saldo: number }>> {
  const parsed = esquemaAbono.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el abono." };
  const v = parsed.data;
  const r = await ejecutar<{ saldo: number }>("registrar_abono", {
    p_cliente_id: v.clienteId,
    p_monto: v.monto,
    p_medio: v.medio,
    p_referencia: v.medio === "transferencia" ? v.referencia || null : null,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}

export async function anularAbono(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_abono", { p_movimiento_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}
