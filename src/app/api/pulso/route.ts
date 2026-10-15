import { obtenerPulso } from "@/lib/datos/pedidos";
import type { Pulso } from "@/lib/pulso";
import { obtenerUsuario } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const CABECERAS = { "Cache-Control": "no-store, max-age=0" };

/**
 * El pulso de las pantallas en vivo del personal (`lib/pulso.ts`): la huella de los pedidos y el resumen del aviso de
 * pedidos en línea. Pocos bytes, una sola consulta a la base. Solo con sesión; sin ella, 401 (no redirige).
 */
export async function GET() {
  if (!(await obtenerUsuario())) return Response.json({ error: "Sin sesión." }, { status: 401, headers: CABECERAS });
  try {
    const p = await obtenerPulso();
    const cuerpo: Pulso = { huella: p.huella, porConfirmar: p.por_confirmar };
    return Response.json(cuerpo, { headers: CABECERAS });
  } catch {
    return Response.json({ error: "No se pudo consultar. Revisa la señal." }, { status: 503, headers: CABECERAS });
  }
}
