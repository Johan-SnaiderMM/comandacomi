/**
 * Rutas que ve un cliente sin cuenta (pedir en línea y seguir su pedido). Allí no corre nada del personal: ni la
 * sincronización del trabajo sin conexión ni el service worker (que además bajaría la app completa al celular del
 * cliente). `public/sw.js` tiene su propia copia de esta regla: si cambia aquí, cambia allá.
 */
export function esRutaPublica(ruta: string): boolean {
  return zonaDeRuta(ruta) !== "personal";
}

/**
 * A quién le habla una ruta: al cliente que va a pedir, al cliente que sigue su pedido o al personal (todo lo demás).
 * La pantalla de "no existe" lo usa para decirle a cada uno lo que le sirve (a un cliente no se le manda al inicio
 * de la app del personal).
 */
export type ZonaDeRuta = "pedir" | "seguimiento" | "personal";

export function zonaDeRuta(ruta: string): ZonaDeRuta {
  if (ruta === "/pedir" || ruta.startsWith("/pedir/")) return "pedir";
  if (ruta === "/seguimiento" || ruta.startsWith("/seguimiento/")) return "seguimiento";
  return "personal";
}
