import { obtenerPlancha } from "@/lib/datos/clientes";
import { obtenerUsuario } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const CABECERAS = { "Cache-Control": "no-store, max-age=0" };

/** Lo que hay que cocinar (la plancha lo consulta cada pocos segundos). Solo con sesión; sin ella, 401 (no redirige). */
export async function GET() {
  if (!(await obtenerUsuario())) return Response.json({ error: "Sin sesión." }, { status: 401, headers: CABECERAS });
  try {
    return Response.json(await obtenerPlancha(), { headers: CABECERAS });
  } catch {
    return Response.json({ error: "No se pudo consultar. Revisa la señal." }, { status: 503, headers: CABECERAS });
  }
}
