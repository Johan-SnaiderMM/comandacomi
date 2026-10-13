import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de UNA sola tarea (tomar pedido, cobrar, cierre…): sin barra de navegación para dar todo el espacio
 * al trabajo; se sale con la flecha de arriba. Exigen sesión. El aviso de pedidos de clientes también vive aquí:
 * quien está cobrando tiene que enterarse. (La plancha va aparte, a lo ancho: ver `(cocina)/layout.tsx`.)
 */
export default async function LayoutTarea({ children }: LayoutProps<"/">) {
  await exigirSesion();
  return (
    <div className="columna-app">
      <AlertaPedidosClientes />
      {children}
    </div>
  );
}
