/**
 * Rutas que ve un cliente sin cuenta (pedir en línea y seguir su pedido). Allí no corre nada del personal: ni la
 * sincronización del trabajo sin conexión ni el service worker (que además bajaría la app completa al celular del
 * cliente). `public/sw.js` tiene su propia copia de esta regla: si cambia aquí, cambia allá.
 */
export function esRutaPublica(ruta: string): boolean {
  return ruta === "/pedir" || ruta.startsWith("/pedir/") || ruta === "/seguimiento" || ruta.startsWith("/seguimiento/");
}
