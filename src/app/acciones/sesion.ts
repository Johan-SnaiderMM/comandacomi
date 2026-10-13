"use server";

import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";
import { destinoDeEntrada } from "@/lib/destinos";

export type EstadoEntrada = { error: string | null };

/**
 * "Entrar a la demo": sin pedir datos. Las credenciales viven solo en variables de entorno del servidor.
 * Con un campo `ir` (de una lista cerrada, ver lib/destinos.ts) entra directo a esa pantalla.
 */
export async function entrarDemo(_anterior: EstadoEntrada, formulario?: FormData): Promise<EstadoEntrada> {
  let error: string | null;
  try {
    ({ error } = await (await bd()).entrarDemo());
  } catch (e) {
    // Lo más común: se publicó sin configurar Supabase. El detalle va al registro del servidor, no a la pantalla.
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    error = "La demo todavía no está configurada. Avisa a quien te la compartió.";
  }
  if (error) return { error };
  redirect(destinoDeEntrada(formulario?.get("ir")?.toString()) ?? "/inicio");
}

export async function salirDemo(): Promise<void> {
  await (await bd()).salir();
  redirect("/");
}
