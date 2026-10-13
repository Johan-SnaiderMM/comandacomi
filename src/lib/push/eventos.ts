import "server-only";
import { consultar, consultarPublico, ejecutar } from "@/lib/datos/llamar";
import {
  avisoALaPlancha,
  avisoClienteAceptado,
  avisoClienteListo,
  avisoClienteRechazado,
  avisoPedidoListo,
  avisoPedidoNuevo,
  avisoPlatosAgregados,
} from "./mensajes";
import { avisosConfigurados, enviarAviso } from "./servidor";
import type { Aviso, CanalPersonal, Destino, InfoPedidoAviso } from "./tipos";

/**
 * Qué aviso sale con cada cosa que pasa en la app. Se llaman con `after()` desde las acciones: corren DESPUÉS de
 * responderle a quien tocó el botón, nunca lo hacen esperar y nunca lanzan (un aviso que falla no deshace nada).
 */

async function seguro(nombre: string, trabajo: () => Promise<void>) {
  if (!avisosConfigurados()) return;
  try {
    await trabajo();
  } catch (e) {
    console.error(`[avisos] ${nombre} falló:`, e instanceof Error ? e.message : e);
  }
}

/** Celulares del personal suscritos a un canal (con la sesión de quien hizo la acción). */
async function avisarPersonal(canal: CanalPersonal, aviso: Aviso) {
  const destinos = await consultar<Destino[]>("listar_destinos_push", { p_canal: canal });
  const r = await enviarAviso(destinos, aviso);
  if (r.caducados.length > 0) await ejecutar("descartar_suscripciones_push", { p_endpoints: r.caducados });
}

async function avisarCliente(info: InfoPedidoAviso, aviso: Aviso) {
  if (info.destinos.length === 0) return;
  const r = await enviarAviso(info.destinos, aviso);
  if (r.caducados.length > 0) await ejecutar("descartar_suscripciones_push", { p_endpoints: r.caducados });
}

const datosDelPedido = (pedidoId: string) => consultar<InfoPedidoAviso>("listar_destinos_push_pedido", { p_pedido_id: pedidoId });

/** Un cliente envió un pedido (sin sesión): al dueño. La base entrega la lista una sola vez por pedido. */
export function alLlegarPedidoCliente(token: string) {
  return seguro("pedido nuevo", async () => {
    const d = await consultarPublico<{ numero?: number; tipo?: "llevar" | "domicilio"; total?: number; destinos: Destino[] }>("publico_destinos_push", { p_token: token });
    if (!d.numero || !d.tipo || d.total === undefined || d.destinos.length === 0) return;
    await enviarAviso(d.destinos, avisoPedidoNuevo({ numero: d.numero, tipo: d.tipo, total: d.total }));
  });
}

/** El restaurante aceptó el pedido de un cliente: a la parrilla y al cliente. */
export function alAceptarPedido(pedidoId: string, minutos: number | null) {
  return seguro("pedido aceptado", async () => {
    const info = await datosDelPedido(pedidoId);
    if (!info.numero) return;
    await Promise.all([avisarPersonal("cocina", avisoALaPlancha(info)), avisarCliente(info, avisoClienteAceptado(info, minutos))]);
  });
}

/** El restaurante rechazó el pedido: al cliente, con el motivo. */
export function alRechazarPedido(pedidoId: string, motivo: string) {
  return seguro("pedido rechazado", async () => {
    const info = await datosDelPedido(pedidoId);
    if (!info.numero) return;
    await avisarCliente(info, avisoClienteRechazado(info, motivo));
  });
}

/**
 * Entró un pedido nuevo a la cocina por el mostrador (mesero/cajero): a la parrilla. Si ya no está por preparar (la
 * operación se subió tarde o se repitió y el pedido ya salió) no se avisa: sería un aviso de algo que ya pasó.
 */
export function alEntrarACocina(pedidoId: string) {
  return seguro("pedido a la plancha", async () => {
    const info = await datosDelPedido(pedidoId);
    if (!info.numero || info.estado !== "pendiente") return;
    await avisarPersonal("cocina", avisoALaPlancha(info));
  });
}

/** A un pedido que ya estaba le agregaron platos: a la parrilla (antes solo se enteraba mirando la pantalla). */
export function alAgregarPlatos(pedidoId: string) {
  return seguro("platos agregados", async () => {
    const info = await datosDelPedido(pedidoId);
    if (!info.numero || info.estado !== "pendiente") return;
    await avisarPersonal("cocina", avisoPlatosAgregados(info));
  });
}

/** Un pedido quedó listo: al mesero y, si lo pidió por la app, al cliente. */
export function alQuedarListo(pedidoId: string) {
  return seguro("pedido listo", async () => {
    const info = await datosDelPedido(pedidoId);
    if (!info.numero || info.estado !== "listo") return;
    await Promise.all([avisarPersonal("listos", avisoPedidoListo(info)), avisarCliente(info, avisoClienteListo(info))]);
  });
}
