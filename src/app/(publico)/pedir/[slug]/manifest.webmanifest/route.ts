import { obtenerMenuPublico } from "@/lib/datos/publico";
import { COLOR_MARCA, COLOR_TEMA } from "@/lib/marca";

export const dynamic = "force-dynamic";

/** El nombre corto del ícono en la pantalla de inicio: cabe en ~12 letras; si no, la primera palabra. */
function nombreCorto(nombre: string): string {
  if (nombre.length <= 12) return nombre;
  return (nombre.split(/\s+/)[0] ?? nombre).slice(0, 12);
}

/**
 * Manifiesto propio de cada restaurante para el panel del cliente: quien agregue el enlace a la pantalla de inicio
 * abre SIEMPRE el panel de pedir de ese local (no la app del personal, que es lo que dice el manifiesto general).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const menu = await obtenerMenuPublico(slug).catch(() => null);
  if (!menu) return new Response("No encontrado", { status: 404 });

  const inicio = `/pedir/${menu.restaurante.slug}`;
  const manifiesto = {
    id: inicio,
    name: menu.restaurante.nombre,
    short_name: nombreCorto(menu.restaurante.nombre),
    description: `Pide en ${menu.restaurante.nombre} desde tu celular.`,
    start_url: inicio,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    background_color: COLOR_MARCA,
    theme_color: COLOR_TEMA,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifiesto), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
