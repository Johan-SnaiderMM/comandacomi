import { BUCKET_PLATOS, RUTA_FOTO, usarBdLocal } from "@/lib/supabase/servidor";

const NO_ENCONTRADA = () => new Response("No encontrada", { status: 404 });

/**
 * Foto de un plato en el MODO LOCAL de desarrollo (DEMO_BD=local), donde no hay Storage. En producción no sirve nada
 * (las fotos salen directo del bucket público, ver lib/fotos.ts). Es pública, como el menú: no pide sesión.
 */
export async function GET(request: Request) {
  // Igual que en abrirBD: con NODE_ENV constante, en producción todo lo de abajo (y la base local) se elimina del paquete.
  if (process.env.NODE_ENV === "production" || !usarBdLocal()) return NO_ENCONTRADA();
  const ruta = new URL(request.url).searchParams.get("ruta") ?? "";
  if (!RUTA_FOTO.test(ruta)) return NO_ENCONTRADA();

  const { leerFotoLocal } = await import("@/lib/local/bd-local");
  const archivo = leerFotoLocal(ruta, BUCKET_PLATOS);
  if (!archivo) return NO_ENCONTRADA();

  return new Response(archivo.datos as BodyInit, {
    headers: { "Content-Type": archivo.tipo, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
