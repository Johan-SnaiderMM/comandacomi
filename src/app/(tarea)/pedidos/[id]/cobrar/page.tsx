import { notFound } from "next/navigation";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarClientes } from "@/lib/datos/fiado";
import { obtenerPedido } from "@/lib/datos/pedidos";
import { ErrorApp } from "@/lib/errores";
import { revisarPermiso } from "@/lib/permisos";
import { Cobrar } from "./cobrar";

export const metadata = { title: "Cobrar" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * IMPORTANTE: esta página SIEMPRE renderiza <Cobrar>. Al cobrar, el servidor refresca la página y el pedido
 * pasa a "cobrado"; si aquí se cambiara de componente, se perdería la confirmación (con el vuelto) que
 * <Cobrar> tiene en pantalla. Es <Cobrar> quien decide si muestra "ya cobrado" o la confirmación.
 */
export default async function PaginaCobrar({ params }: PageProps<"/pedidos/[id]/cobrar">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Sin permiso de caja no se llega a <Cobrar>; con él, la regla de arriba sigue igual.
  if (!(await revisarPermiso("cobrar")).permitido) return <SinPermiso pantalla="cobrar" />;

  let detalle;
  try {
    detalle = await obtenerPedido(id);
  } catch (e) {
    if (e instanceof ErrorApp) notFound();
    throw e;
  }

  const cobrable = !detalle.pedido.anulado && !detalle.pedido.cobrado;
  const clientes = cobrable ? await listarClientes() : [];
  return <Cobrar detalle={detalle} clientes={clientes} />;
}
