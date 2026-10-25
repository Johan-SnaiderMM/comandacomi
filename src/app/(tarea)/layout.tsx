import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BandaVerComo } from "@/components/equipo/banda-ver-como";
import { abre } from "@/lib/areas";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de UNA sola tarea (tomar pedido, cobrar, cierre…): sin barra de navegación, se sale con la flecha de arriba.
 * Llevan el aviso de pedidos en línea: quien está cobrando también tiene que enterarse.
 */
export default async function LayoutTarea({ children }: LayoutProps<"/">) {
  await exigirSesion();
  const { quien } = await obtenerQuien();
  return (
    <div className="columna-app">
      {quien.viendoComo && (
        <div className="no-imprimir">
          <BandaVerComo nombre={quien.viendoComo} />
        </div>
      )}
      {abre(quien, "pedidos") && <AlertaPedidosClientes />}
      {children}
    </div>
  );
}
