import "server-only";
import { consultar } from "./llamar";
import type { PedidoPorConfirmar, Plancha } from "./tipos";

/** Pedidos de clientes en línea que esperan que el restaurante los acepte o rechace, el más viejo primero. */
export const listarPedidosPorConfirmar = () => consultar<PedidoPorConfirmar[]>("listar_pedidos_por_confirmar");

/** Lo que hay que cocinar, pedido por pedido y plato por plato (más los que se acaban de marcar listos). */
export const obtenerPlancha = () => consultar<Plancha>("listar_plancha");
