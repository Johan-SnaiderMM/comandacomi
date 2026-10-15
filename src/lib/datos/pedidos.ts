import "server-only";
import { consultar } from "./llamar";
import type { MenuParaPedido, PedidoCobrado, PedidoDetalle, PedidoPendiente, ResumenPorConfirmar } from "./tipos";

export const obtenerMenuParaPedido = () => consultar<MenuParaPedido>("obtener_menu_para_pedido");
export const listarPedidosPendientes = () => consultar<PedidoPendiente[]>("listar_pedidos_pendientes");
export const listarPedidosCobradosHoy = () => consultar<PedidoCobrado[]>("listar_pedidos_cobrados_hoy");
export const obtenerPedido = (id: string) => consultar<PedidoDetalle>("obtener_pedido", { p_pedido_id: id });

/**
 * La huella de los pedidos (migración 24): pídela ANTES que los datos que acompaña. Si algo cambia entre las dos
 * consultas, la huella queda vieja y el pulso pide refrescar (nunca al revés, que dejaría un cambio sin mostrar).
 */
export const obtenerHuella = () => consultar<string>("huella_pedidos");
/** Lo que las pantallas en vivo preguntan cada pocos segundos (`lib/pulso.ts`). */
export const obtenerPulso = () => consultar<{ huella: string; por_confirmar: ResumenPorConfirmar | null }>("pulso");
