import { verPedidoPublico } from "@/lib/datos/publico";
import { esquemaTokenSeguimiento } from "@/lib/esquemas/publico";

export const dynamic = "force-dynamic";

const CABECERAS = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

/**
 * Estado de UN pedido por su código secreto (la pantalla de seguimiento lo consulta cada pocos segundos).
 * Público a propósito: no pide sesión, y solo devuelve ese pedido.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!esquemaTokenSeguimiento.safeParse(token).success) {
    return Response.json({ error: "El código del pedido no es válido." }, { status: 400, headers: CABECERAS });
  }
  try {
    const seguimiento = await verPedidoPublico(token);
    if (!seguimiento) return Response.json({ error: "No encontramos este pedido." }, { status: 404, headers: CABECERAS });
    return Response.json(seguimiento, { headers: CABECERAS });
  } catch {
    return Response.json({ error: "No se pudo consultar el pedido. Revisa la señal." }, { status: 503, headers: CABECERAS });
  }
}
