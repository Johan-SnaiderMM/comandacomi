import "server-only";
import { consultar } from "./llamar";
import type { CierreDelDia, GastosDelDia } from "./tipos";

export const listarGastos = (fecha?: string) => consultar<GastosDelDia>("listar_gastos", fecha ? { p_fecha: fecha } : {});
export const obtenerCierreDelDia = () => consultar<CierreDelDia>("obtener_resumen_dia");
