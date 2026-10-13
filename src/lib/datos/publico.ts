import "server-only";
import { cache } from "react";
import type { MenuPublico, SeguimientoPublico } from "@/lib/publico/tipos";
import { consultarPublico } from "./llamar";

/**
 * Menú del restaurante para el panel del cliente (null si el enlace no existe). No pide sesión.
 * Con `cache` la página y su metadata comparten una sola consulta por petición.
 */
export const obtenerMenuPublico = cache((slug: string) => consultarPublico<MenuPublico | null>("publico_menu", { p_slug: slug }));

/** Estado de UN pedido, por su código secreto (null si no existe). No pide sesión. */
export const verPedidoPublico = cache((token: string) => consultarPublico<SeguimientoPublico | null>("publico_ver_pedido", { p_token: token }));
