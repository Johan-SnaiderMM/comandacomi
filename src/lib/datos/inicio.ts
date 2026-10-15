import "server-only";
import { cache } from "react";
import { consultar } from "./llamar";
import type { DatosPrimerosPasos } from "@/lib/primeros-pasos";
import type { Contexto, Inicio } from "./tipos";

export const obtenerContexto = cache(() => consultar<Contexto>("obtener_contexto"));
export const obtenerInicio = () => consultar<Inicio>("obtener_inicio");
export const contarPendientes = () => consultar<number>("contar_pendientes");
/** El último día de trabajo con movimiento que quedó sin cerrar (YYYY-MM-DD), o null. Solo para quien ve el cierre. */
export const obtenerDiaSinCerrar = () => consultar<string | null>("dia_sin_cerrar");
/** Lo que ya tiene armado un local nuevo (menú, mesas, equipo…). Solo el dueño. */
export const obtenerPrimerosPasos = () => consultar<DatosPrimerosPasos>("primeros_pasos");
