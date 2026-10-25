import "server-only";
import { BUCKET_PLATOS, RUTA_FOTO, usarBdLocal } from "@/lib/supabase/servidor";

/**
 * Dirección de la foto pública de un plato: en producción sale directo de Storage, sin gastar funciones. Devuelve null
 * si la ruta no tiene la forma esperada (nunca se arma una dirección con un dato raro).
 */
export function urlFotoPlato(ruta: string | null | undefined): string | null {
  if (!ruta || !RUTA_FOTO.test(ruta)) return null;
  if (usarBdLocal()) return `/api/foto-plato?ruta=${encodeURIComponent(ruta)}`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_PLATOS}/${ruta}`;
}
