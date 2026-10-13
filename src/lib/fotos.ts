import "server-only";
import { BUCKET_PLATOS, RUTA_FOTO, usarBdLocal } from "@/lib/supabase/servidor";

/**
 * Dirección de la foto de un plato para ponerla en un <img>. Las fotos de los platos son públicas (las ve cualquiera
 * que tenga el enlace del menú), así que en producción salen directo de Storage, sin pasar por el servidor de la app:
 * más rápido y sin gastar funciones. En el modo local de desarrollo las sirve una ruta propia.
 * Devuelve null si no hay foto o la ruta no tiene la forma esperada (nunca se arma una dirección con un dato raro).
 */
export function urlFotoPlato(ruta: string | null | undefined): string | null {
  if (!ruta || !RUTA_FOTO.test(ruta)) return null;
  if (usarBdLocal()) return `/api/foto-plato?ruta=${encodeURIComponent(ruta)}`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_PLATOS}/${ruta}`;
}
