"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { listarClientes } from "@/lib/datos/fiado";
import { obtenerContexto } from "@/lib/datos/inicio";
import { ejecutar } from "@/lib/datos/llamar";
import { listarPedidosCobradosHoy, listarPedidosPendientes, obtenerMenuParaPedido } from "@/lib/datos/pedidos";
import { ErrorApp } from "@/lib/errores";
import { alEntrarACocina, alQuedarListo } from "@/lib/push/eventos";
import { argumentosDeOperacion, esquemaSobreOperacion } from "@/lib/esquemas/operacion";
import { obtenerUsuario } from "@/lib/sesion";
import type { RespuestaOperacion, Snapshot } from "@/lib/sync/tipos";

/**
 * Aplica UNA operación (hecha con o sin señal). Llega con su clave: si ya se aplicó antes, la base devuelve el
 * mismo resultado en vez de repetirla. Sin sesión no redirige (la cola sigue guardada): avisa con `sinSesion`.
 */
export async function aplicarOperacion(entrada: unknown): Promise<RespuestaOperacion> {
  const sobre = esquemaSobreOperacion.safeParse(entrada);
  if (!sobre.success) return { ok: false, error: sobre.error.issues[0]?.message ?? "La operación no es válida." };
  const { clave, tipo, ocurridoEn, datos } = sobre.data;

  if (!(await obtenerUsuario())) return { ok: false, error: "Vuelve a entrar para guardar los cambios.", sinSesion: true };

  const construido = argumentosDeOperacion(tipo, datos);
  if (!construido.ok) return construido;

  const r = await ejecutar<unknown>("aplicar_operacion", { p_clave: clave, p_tipo: tipo, p_args: construido.args, p_ocurrido_en: ocurridoEn });
  if (!r.ok) return r;
  // Avisos push con la app cerrada. Un reintento de la misma operación repite el aviso, pero lleva la misma etiqueta:
  // en el celular reemplaza al anterior en vez de apilarse.
  const args = construido.args;
  if (tipo === "crear_pedido" && typeof args.p_id === "string") after(() => alEntrarACocina(args.p_id as string));
  if (tipo === "cambiar_estado" && args.p_estado === "listo" && typeof args.p_pedido_id === "string") after(() => alQuedarListo(args.p_pedido_id as string));
  revalidatePath("/", "layout");
  return { ok: true, datos: r.datos };
}

/**
 * Todo lo que hace falta para seguir trabajando sin señal: menú, pedidos por entregar o cobrar, cobrados de hoy y
 * clientes con lo que deben. Devuelve null si no hay sesión o la base no contestó (el celular conserva la anterior).
 */
export async function obtenerSnapshot(): Promise<Snapshot | null> {
  if (!(await obtenerUsuario())) return null;
  try {
    const [contexto, menu, pendientes, cobrados, clientes] = await Promise.all([
      obtenerContexto(),
      obtenerMenuParaPedido(),
      listarPedidosPendientes(),
      listarPedidosCobradosHoy(),
      listarClientes(),
    ]);
    return { version: 1, guardadoEn: new Date().toISOString(), contexto, menu, pendientes, cobrados, clientes };
  } catch (e) {
    if (e instanceof ErrorApp) return null;
    throw e;
  }
}
