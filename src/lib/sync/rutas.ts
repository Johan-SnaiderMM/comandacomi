/**
 * Rutas de la app sin conexión (/sc). Todo vive en una sola página y la ruta va en el # de la dirección, con la misma
 * forma que las rutas normales de la app: "/sc#/pedidos", "/sc#/pedidos/<id>/cobrar", "/sc#/pedido/nuevo?agregar=<id>".
 * Lo que no funciona sin señal (cierre, menú, fichas de cliente…) lleva a una pantalla que lo explica.
 */

/** Rutas de la app que sí funcionan sin conexión. */
const SOPORTADAS = [
  /^\/inicio$/,
  /^\/pedidos$/,
  /^\/pedido\/nuevo$/,
  /^\/pedidos\/[^/]+\/cobrar$/,
  /^\/fiado$/,
  /^\/gastos$/, // solo la confirmación "gasto guardado" (la lista necesita señal)
  /^\/gastos\/nuevo$/,
  /^\/mas$/,
  /^\/sincronizacion$/,
  /^\/requiere-conexion$/,
];

export type RutaSC = { ruta: string; query: URLSearchParams };

/** "#/pedidos?enviado=3" -> { ruta: "/pedidos", query: enviado=3 }. Sin hash: el inicio. */
export function parsearRuta(hash: string): RutaSC {
  const texto = hash.replace(/^#/, "") || "/inicio";
  const i = texto.indexOf("?");
  const ruta = (i === -1 ? texto : texto.slice(0, i)) || "/inicio";
  return { ruta: ruta.startsWith("/") ? ruta : `/${ruta}`, query: new URLSearchParams(i === -1 ? "" : texto.slice(i + 1)) };
}

/** Ruta de la app ("/pedidos?x=1") -> hash de la página sin conexión; lo que no existe allí va a "requiere conexión". */
export function hashDeRuta(href: string): string {
  const { ruta } = parsearRuta(href);
  if (SOPORTADAS.some((r) => r.test(ruta))) return `#${href.startsWith("/") ? href : `/${href}`}`;
  return `#/requiere-conexion?ruta=${encodeURIComponent(href)}`;
}

/** Pestañas de la barra inferior a las que pertenece una ruta (para marcar la activa). */
export function esRutaDeTarea(ruta: string): boolean {
  return /^\/pedido\/nuevo$|^\/pedidos\/[^/]+\/cobrar$|^\/gastos(\/nuevo)?$/.test(ruta);
}

/** Id del pedido de "/pedidos/<id>/cobrar" (null si la ruta es otra). */
export function idDeCobro(ruta: string): string | null {
  return /^\/pedidos\/([^/]+)\/cobrar$/.exec(ruta)?.[1] ?? null;
}
