import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BandaVerComo } from "@/components/equipo/banda-ver-como";
import { abre } from "@/lib/areas";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de UNA sola tarea (tomar pedido, cobrar, cierre…): sin barra de navegación para dar todo el espacio
 * al trabajo; se sale con la flecha de arriba. Exigen sesión. El aviso de pedidos de clientes también vive aquí:
 * quien está cobrando tiene que enterarse (si toma pedidos: aceptarlos es de ese permiso). (La plancha va aparte, a lo
 * ancho: ver `(cocina)/layout.tsx`.)
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
