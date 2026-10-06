import { bd } from "@/lib/datos/bd";
import { obtenerContexto } from "@/lib/datos/inicio";
import { obtenerUsuario } from "@/lib/sesion";
import { RUTA_FOTO } from "@/lib/supabase/servidor";

const NO_ENCONTRADA = () => new Response("No encontrada", { status: 404 });

/**
 * Sirve la foto de un gasto SOLO a usuarios con sesión y solo de la carpeta de su restaurante
 * (además, Storage aplica RLS por carpeta). Mismo origen: no hace falta abrir la política de imágenes.
 */
export async function GET(request: Request) {
  const ruta = new URL(request.url).searchParams.get("ruta") ?? "";
  if (!RUTA_FOTO.test(ruta)) return NO_ENCONTRADA();

  if (!(await obtenerUsuario())) return new Response("Sin sesión", { status: 401 });
  const restaurante = (await obtenerContexto()).restaurante;
  if (!restaurante || !ruta.startsWith(`${restaurante.id}/`)) return NO_ENCONTRADA();

  const archivo = await (await bd()).leerArchivo(ruta);
  if (!archivo) return NO_ENCONTRADA();

  return new Response(archivo.datos as BodyInit, {
    headers: {
      "Content-Type": archivo.tipo,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
