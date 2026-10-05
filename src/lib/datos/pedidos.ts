import "server-only";
import { consultar } from "./llamar";
import type { MenuParaPedido, PedidoCobrado, PedidoDetalle, PedidoPendiente } from "./tipos";

export const obtenerMenuParaPedido = () => consultar<MenuParaPedido>("obtener_menu_para_pedido");
export const listarPedidosPendientes = () => consultar<PedidoPendiente[]>("listar_pedidos_pendientes");
export const listarPedidosCobradosHoy = () => consultar<PedidoCobrado[]>("listar_pedidos_cobrados_hoy");
export const obtenerPedido = (id: string) => consultar<PedidoDetalle>("obtener_pedido", { p_pedido_id: id });
