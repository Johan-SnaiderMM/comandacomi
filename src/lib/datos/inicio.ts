import "server-only";
import { cache } from "react";
import { consultar } from "./llamar";
import type { Contexto, Inicio } from "./tipos";

export const obtenerContexto = cache(() => consultar<Contexto>("obtener_contexto"));
export const obtenerInicio = () => consultar<Inicio>("obtener_inicio");
export const contarPendientes = () => consultar<number>("contar_pendientes");
