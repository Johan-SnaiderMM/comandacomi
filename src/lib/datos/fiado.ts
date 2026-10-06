import "server-only";
import { consultar } from "./llamar";
import type { ClienteFiado, FichaFiado } from "./tipos";

export const listarClientes = () => consultar<ClienteFiado[]>("listar_clientes");
export const obtenerClienteFiado = (id: string) => consultar<FichaFiado>("obtener_cliente_fiado", { p_cliente_id: id });
