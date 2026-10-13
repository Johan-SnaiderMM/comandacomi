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

/**
 * El destino que trae la dirección de la portada desde la que se entró (`https://…/?ir=/plancha`), con la misma lista
 * cerrada. La portada es estática y lee `?ir=` en el navegador: quien toca "Entrar" antes de que termine de cargar
 * envía el formulario sin ese dato, y el servidor lo recupera de aquí.
 */
export function destinoDesdeDireccion(direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  try {
    const url = new URL(direccion);
    return url.pathname === "/" ? destinoDeEntrada(url.searchParams.get("ir")) : null;
  } catch {
    return null; // no era una dirección
  }
}
