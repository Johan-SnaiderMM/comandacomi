"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";
import { ejecutar } from "@/lib/datos/llamar";
import { destinoDeEntrada, destinoDesdeDireccion } from "@/lib/destinos";

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
  // El campo `ir` lo pone el navegador al leer la dirección. Si tocaron "Entrar" antes de eso, el formulario llega sin
  // él: la dirección de la portada (cabecera Referer) trae el mismo dato.
  const destino =
    destinoDeEntrada(formulario?.get("ir")?.toString()) ?? destinoDesdeDireccion((await headers()).get("referer"));
  redirect(destino ?? "/inicio");
}

/**
 * Salir. Si el celular tenía avisos activos (campo `endpoint` del formulario) se dan de baja primero: al salir, ese
 * celular ya no es de nadie del equipo y no debe seguir recibiendo pedidos con nombres de clientes.
 */
export async function salirDemo(formulario?: FormData): Promise<void> {
  const endpoint = formulario?.get("endpoint");
  if (typeof endpoint === "string" && endpoint.length > 0 && endpoint.length <= 800) {
    await ejecutar("quitar_suscripcion_push", { p_endpoint: endpoint }); // si falla, salir sigue igual
  }
  await (await bd()).salir();
  redirect("/");
}
