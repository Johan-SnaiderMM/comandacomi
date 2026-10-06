import "server-only";
import { consultar } from "./llamar";
import type { MenuAdmin } from "./tipos";

export const listarMenuAdmin = () => consultar<MenuAdmin>("listar_menu_admin");
