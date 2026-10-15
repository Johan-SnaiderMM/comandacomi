import "server-only";
import { consultar } from "./llamar";
import type { CierreDelDia, GastosDelDia } from "./tipos";

export const listarGastos = (fecha?: string) => consultar<GastosDelDia>("listar_gastos", fecha ? { p_fecha: fecha } : {});
/** Sin fecha, el día de trabajo; con fecha (YYYY-MM-DD), ese día (para cerrar uno que quedó abierto). */
export const obtenerCierreDelDia = (fecha?: string | null) => consultar<CierreDelDia>("obtener_resumen_dia", fecha ? { p_fecha: fecha } : {});
