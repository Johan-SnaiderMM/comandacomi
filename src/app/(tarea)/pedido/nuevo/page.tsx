import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerMenuParaPedido, obtenerPedido } from "@/lib/datos/pedidos";
import { ErrorApp } from "@/lib/errores";
import { revisarPermiso } from "@/lib/permisos";
import { TomarPedido, type ModoAgregar } from "./tomar-pedido";

export const metadata = { title: "Tomar pedido" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Si se llega con ?agregar=<id> se agregan platos a ese pedido en vez de crear uno nuevo. */
async function modoAgregar(id: string | undefined): Promise<ModoAgregar | null> {
  if (!id || !UUID.test(id)) return null;
  try {
    const { pedido } = await obtenerPedido(id);
    if (pedido.cobrado || pedido.anulado) return null;
    const donde = pedido.mesa ?? pedido.contacto_nombre ?? (pedido.tipo === "llevar" ? "Para llevar" : "Domicilio");
    return { pedidoId: pedido.id, numero: pedido.numero, tipo: pedido.tipo, etiqueta: `Pedido #${pedido.numero} · ${donde}` };
  } catch (e) {
    if (e instanceof ErrorApp) return null;
    throw e;
  }
}

export default async function PaginaTomarPedido({ searchParams }: PageProps<"/pedido/nuevo">) {
  if (!(await revisarPermiso("tomar")).permitido) return <SinPermiso pantalla="tomar" />;
  const sp = await searchParams;
  const agregar = typeof sp.agregar === "string" ? sp.agregar : undefined;
  const [menu, modo] = await Promise.all([obtenerMenuParaPedido(), modoAgregar(agregar)]);
  return <TomarPedido menu={menu} agregar={modo} />;
}
