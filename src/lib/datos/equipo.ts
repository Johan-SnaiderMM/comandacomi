import "server-only";
import { consultar } from "./llamar";
import type { Equipo } from "./tipos";

export const listarEquipo = () => consultar<Equipo>("listar_equipo");
