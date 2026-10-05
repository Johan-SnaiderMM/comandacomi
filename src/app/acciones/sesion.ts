"use server";

import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";

export type EstadoEntrada = { error: string | null };

/** "Entrar a la demo": sin pedir datos. Las credenciales viven solo en variables de entorno del servidor. */
export async function entrarDemo(_anterior: EstadoEntrada): Promise<EstadoEntrada> {
  const { error } = await (await bd()).entrarDemo();
  if (error) return { error };
  redirect("/inicio");
}

export async function salirDemo(): Promise<void> {
  await (await bd()).salir();
  redirect("/");
}
