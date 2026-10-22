"use server";

import { after } from "next/server";
import { ejecutarPublico } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaPedidoCliente, esquemaTokenSeguimiento } from "@/lib/esquemas/publico";
import { alLlegarPedidoCliente } from "@/lib/push/eventos";

// Acciones del cliente SIN cuenta. No piden sesión: lo único que pueden tocar son las funciones publico_* de la base,
// que validan todo, leen los precios de la base y filtran por el restaurante del enlace.

export type PedidoEnviado = { token: string; numero: number; total: number };

/** El cliente envía su pedido. Entra "por confirmar": el restaurante lo acepta o lo rechaza. */
export async function enviarPedidoCliente(entrada: unknown): Promise<Resultado<PedidoEnviado>> {
  const parsed = esquemaPedidoCliente.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa tu pedido." };
  const v = parsed.data;
  // Campo trampa lleno = programa, no persona: se responde como un error cualquiera.
  if (v.sitio) return { ok: false, error: "No se pudo enviar el pedido. Intenta de nuevo." };

  const r = await ejecutarPublico<PedidoEnviado>("publico_crear_pedido", {
    p_slug: v.slug,
    p_tipo: v.tipo,
    p_nombre: v.nombre,
    p_telefono: v.telefono,
    p_direccion: v.tipo === "domicilio" ? v.direccion : null,
    p_notas: v.notas || null,
    p_items: v.items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad, adiciones: i.adiciones, notas: i.notas || null })),
    p_acepta_datos: v.aceptaDatos,
  });
  // Aviso push al dueño (con la app cerrada). Sale DESPUÉS de responderle al cliente y nunca lo hace esperar.
  if (r.ok) after(() => alLlegarPedidoCliente(r.datos.token));
  return r;
}

/** El cliente cancela su pedido mientras el restaurante no lo ha aceptado. */
export async function cancelarPedidoCliente(token: string): Promise<Resultado> {
  const parsed = esquemaTokenSeguimiento.safeParse(token);
  if (!parsed.success) return { ok: false, error: "El código del pedido no es válido." };
  const r = await ejecutarPublico("publico_cancelar_pedido", { p_token: parsed.data });
  return r.ok ? { ok: true } : r;
}
