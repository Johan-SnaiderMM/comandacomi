import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BandaVerComo } from "@/components/equipo/banda-ver-como";
import { abre } from "@/lib/areas";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

/**
 * La plancha usa todo el ancho, no la columna de celular: se mira en tableta o con el celular acostado, con varios
 * pedidos lado a lado. Lleva el aviso de pedidos en línea solo para quien toma pedidos.
 */
export default async function LayoutCocina({ children }: LayoutProps<"/">) {
  await exigirSesion();
  const { quien } = await obtenerQuien();
  return (
    <div className="min-h-dvh bg-fondo">
      {quien.viendoComo && <BandaVerComo nombre={quien.viendoComo} />}
      {abre(quien, "pedidos") && <AlertaPedidosClientes />}
      {children}
    </div>
  );
}
