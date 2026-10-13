import "server-only";
import { consultar } from "./llamar";
import type { MenuAdmin, MesaAdmin } from "./tipos";

export const listarMenuAdmin = () => consultar<MenuAdmin>("listar_menu_admin");
export const listarMesasAdmin = () => consultar<MesaAdmin[]>("listar_mesas_admin");
