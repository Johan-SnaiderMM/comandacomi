"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaCliente } from "@/lib/esquemas/cobro";

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
