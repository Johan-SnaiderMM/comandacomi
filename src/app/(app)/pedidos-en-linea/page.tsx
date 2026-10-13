import { redirect } from "next/navigation";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { obtenerContexto } from "@/lib/datos/inicio";
import { PanelPedidosEnLinea } from "./panel-pedidos-en-linea";

export const metadata = { title: "Pedidos en línea" };

/**
 * Pedidos en línea: el enlace (y el código QR) para que los clientes pidan desde su celular, y el interruptor para
 * abrir o cerrar la recepción. Quien abre o cierra es el dueño.
 */
export default async function PaginaPedidosEnLinea() {
  const contexto = await obtenerContexto();
  if (!contexto.restaurante) redirect("/");
  return (
    <>
      <EncabezadoPantalla titulo="Pedidos en línea" atras="/mas" />
      <main className="pb-nav space-y-4 px-4 pt-4">
        <PanelPedidosEnLinea
          slug={contexto.restaurante.slug}
          nombre={contexto.restaurante.nombre}
          activo={contexto.restaurante.pedidos_en_linea}
          esDueno={contexto.perfil?.rol === "dueno"}
          esDemo={contexto.restaurante.es_demo}
        />
      </main>
    </>
  );
}
