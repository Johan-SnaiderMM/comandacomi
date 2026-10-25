/**
 * La dirección de un aviso siempre es del servicio del navegador (Google, Mozilla, Apple, Microsoft). Otra la escribió
 * alguien para usar nuestro servidor contra otro sitio: se rechaza al guardar y se salta al enviar.
 */

/** Dominios de los servicios de avisos de los navegadores (el dominio exacto o cualquier subdominio). */
export const SERVICIOS_PUSH = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"] as const;

/**
 * Solo para las pruebas de punta a punta (`npm run e2e:clientes`), que fingen una suscripción: el dominio `.invalid`
 * está reservado y nunca existe, así que el envío falla sin salir a ningún lado. En producción no se acepta.
 */
const PRUEBAS = process.env.NODE_ENV !== "production" ? [".invalid"] : [];

export function servicioPushPermitido(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  if (PRUEBAS.some((sufijo) => host.endsWith(sufijo))) return true;
  return SERVICIOS_PUSH.some((d) => host === d || host.endsWith("." + d));
}
