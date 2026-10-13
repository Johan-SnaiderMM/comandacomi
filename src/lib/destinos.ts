/**
 * A dónde puede llevar un enlace de entrada (`/?ir=/plancha`): una lista cerrada, para que "ir" nunca sea una
 * redirección abierta. Sirve para compartir un enlace por rol (parrilla, mesero) que entra con un toque.
 */
export const DESTINOS_DE_ENTRADA: Record<string, string> = {
  "/plancha": "la plancha",
  "/pedidos": "los pedidos pendientes",
  "/pedidos-en-linea": "pedidos en línea",
  "/inicio": "el inicio",
  "/mas": "Más",
};

/** La ruta si está permitida; si no, null. */
export function destinoDeEntrada(ir: string | null | undefined): string | null {
  return ir && Object.hasOwn(DESTINOS_DE_ENTRADA, ir) ? ir : null;
}
