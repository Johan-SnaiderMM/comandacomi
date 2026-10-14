import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BandaVerComo } from "@/components/equipo/banda-ver-como";
import { abre } from "@/lib/areas";
import { obtenerQuien } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de cocina (la plancha). A diferencia del resto de la app, NO van en la columna angosta de celular: usan
 * todo el ancho, porque la plancha se mira en una tableta o con el celular acostado y ahí caben varios pedidos lado a
 * lado. (Dentro de la columna de 480 px el panel repartía tres columnas de 144 px y los platos salían cortados.)
 * Exigen sesión y llevan el aviso de pedidos de clientes, como las demás pantallas del personal (solo para quien
 * también toma pedidos: aceptarlos es de ese permiso).
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
