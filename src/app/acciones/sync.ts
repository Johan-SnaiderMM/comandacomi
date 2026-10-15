"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { leerVerComo } from "@/lib/areas";
import { listarClientes } from "@/lib/datos/fiado";
import { obtenerContexto } from "@/lib/datos/inicio";
import { consultar } from "@/lib/datos/llamar";
import { listarPedidosCobradosHoy, listarPedidosPendientes, obtenerHuella, obtenerMenuParaPedido } from "@/lib/datos/pedidos";
import { ErrorApp, esFalloPasajero, MENSAJE_GENERICO } from "@/lib/errores";
import { alAgregarPlatos, alEntrarACocina, alQuedarListo } from "@/lib/push/eventos";
import { argumentosDeOperacion, esquemaSobreOperacion } from "@/lib/esquemas/operacion";
import { COOKIE_VER_COMO } from "@/lib/permisos";
import { obtenerUsuario } from "@/lib/sesion";
import type { RespuestaOperacion, Snapshot } from "@/lib/sync/tipos";

/**
 * Aplica UNA operación (hecha con o sin señal). Llega con su clave: si ya se aplicó antes, la base devuelve el
 * mismo resultado en vez de repetirla. Sin sesión no redirige (la cola sigue guardada): avisa con `sinSesion`.
 *
 * Distingue dos clases de "no": el rechazo de la base por una regla del negocio (definitivo: la persona lo revisa) y
 * el fallo pasajero (la base no contestó): ese se marca `reintentable` para que el celular lo vuelva a intentar solo.
 */
export async function aplicarOperacion(entrada: unknown): Promise<RespuestaOperacion> {
  const sobre = esquemaSobreOperacion.safeParse(entrada);
  if (!sobre.success) return { ok: false, error: sobre.error.issues[0]?.message ?? "La operación no es válida." };
  const { clave, tipo, ocurridoEn, datos } = sobre.data;

  if (!(await obtenerUsuario())) return { ok: false, error: "Vuelve a entrar para guardar los cambios.", sinSesion: true };

  const construido = argumentosDeOperacion(tipo, datos);
  if (!construido.ok) return construido;

  let resultado: unknown;
  try {
    resultado = await consultar<unknown>("aplicar_operacion", { p_clave: clave, p_tipo: tipo, p_args: construido.args, p_ocurrido_en: ocurridoEn });
  } catch (e) {
    unstable_rethrow(e); // redirecciones y otros errores internos de Next no se tragan
    if (e instanceof ErrorApp) return esFalloPasajero(e.codigo) ? { ok: false, error: e.message, reintentable: true } : { ok: false, error: e.message };
    // Ni siquiera se pudo hablar con la base (configuración, conexión): tampoco es culpa de la operación.
    console.error("[sync] aplicar_operacion no llegó a la base:", e instanceof Error ? e.message : e);
    return { ok: false, error: MENSAJE_GENERICO, reintentable: true };
  }
  // Avisos push con la app cerrada. Un reintento de la misma operación repite el aviso, pero lleva la misma etiqueta:
  // en el celular reemplaza al anterior en vez de apilarse.
  const args = construido.args;
  // `para_cocina` (migración 14): cuántas de las líneas nuevas hay que cocinar. Solo bebidas = no se avisa a la parrilla.
  const paraCocina = (resultado as { para_cocina?: unknown } | null)?.para_cocina;
  const vaACocina = typeof paraCocina !== "number" || paraCocina > 0;
  if (tipo === "crear_pedido" && vaACocina && typeof args.p_id === "string") after(() => alEntrarACocina(args.p_id as string));
  if (tipo === "agregar_items" && vaACocina && typeof args.p_pedido_id === "string") after(() => alAgregarPlatos(args.p_pedido_id as string));
  if (tipo === "cambiar_estado" && args.p_estado === "listo" && typeof args.p_pedido_id === "string") after(() => alQuedarListo(args.p_pedido_id as string));
  revalidatePath("/", "layout");
  return { ok: true, datos: resultado };
}

/**
 * Todo lo que hace falta para seguir trabajando sin señal: menú, pedidos por entregar o cobrar, cobrados de hoy y
 * clientes con lo que deben. Devuelve null si no hay sesión o la base no contestó (el celular conserva la anterior).
 */
export async function obtenerSnapshot(): Promise<Snapshot | null> {
  if (!(await obtenerUsuario())) return null;
  try {
    // La huella va primero (ver obtenerHuella). Sin ella (la base sin la migración 24) la copia sirve igual.
    const huella = await obtenerHuella().catch(() => undefined);
    const [contexto, menu, pendientes, cobrados, clientes] = await Promise.all([
      obtenerContexto(),
      obtenerMenuParaPedido(),
      listarPedidosPendientes(),
      listarPedidosCobradosHoy(),
      listarClientes(),
    ]);
    // El dueño que está viendo la app "como" un rol la ve igual sin conexión.
    const verComo = leerVerComo((await cookies()).get(COOKIE_VER_COMO)?.value);
    const visto =
      verComo && contexto.perfil?.rol === "dueno"
        ? { ...contexto, perfil: { ...contexto.perfil, rol: "ayudante" as const, areas: verComo.areas, roles: [verComo.nombre] } }
        : contexto;
    return { version: 1, guardadoEn: new Date().toISOString(), huella, contexto: visto, menu, pendientes, cobrados, clientes };
  } catch (e) {
    if (e instanceof ErrorApp) return null;
    throw e;
  }
}
