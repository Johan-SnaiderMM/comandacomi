/** Errores que se pueden mostrar tal cual al usuario (siempre en español). */
export class ErrorApp extends Error {
  constructor(
    mensaje: string,
    readonly codigo = ""
  ) {
    super(mensaje);
    this.name = "ErrorApp";
  }
}

export const MENSAJE_GENERICO = "No se pudo completar. Revisa la señal e intenta de nuevo.";

/**
 * Las funciones SQL lanzan errores de negocio en español con códigos P0001 (validación), P0002 (no existe)
 * y 42501 (sin permiso). Esos mensajes se muestran tal cual; todo lo demás (red, errores técnicos de
 * Postgres en inglés) se reemplaza por un mensaje genérico para no asustar ni filtrar detalles.
 */
export function mensajeDeError(error: { codigo?: string; mensaje?: string }): string {
  const codigo = error.codigo ?? "";
  const mensaje = error.mensaje ?? "";
  if (codigo === "P0001" || codigo === "P0002") return mensaje || MENSAJE_GENERICO;
  if (codigo === "42501" && !/^permission denied/i.test(mensaje)) return mensaje || MENSAJE_GENERICO;
  return MENSAJE_GENERICO;
}

/**
 * ¿El fallo fue pasajero y vale la pena reintentar la MISMA operación más tarde? Pasajero = la base no contestó, estaba
 * ocupada o se cortó la red entre servidores. Lo contrario es un rechazo definitivo: una regla del negocio (P0001,
 * P0002, 42501) o datos que la base nunca va a aceptar (clases 22, 23 y 42 de Postgres); reintentar eso no sirve.
 */
export function esFalloPasajero(codigo: string | undefined): boolean {
  const c = codigo ?? "";
  if (c === "") return true; // sin código: la petición ni llegó a la base (red, puerta de enlace caída)
  if (/^PGRST00[0-3]$/.test(c)) return true; // la API no pudo conectarse a la base
  if (/^(08|40|53|57)/.test(c)) return true; // conexión, bloqueo mutuo, sin recursos, tiempo agotado o base reiniciando
  return c === "55P03"; // no alcanzó a tomar un candado
}

/** Resultado estándar de una acción del servidor (nada de excepciones hacia el cliente). */
export type Resultado<T = undefined> = ({ ok: true } & (T extends undefined ? object : { datos: T })) | { ok: false; error: string };
