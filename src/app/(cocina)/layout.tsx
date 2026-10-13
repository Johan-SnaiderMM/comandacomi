import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de cocina (la plancha). A diferencia del resto de la app, NO van en la columna angosta de celular: usan
 * todo el ancho, porque la plancha se mira en una tableta o con el celular acostado y ahí caben varios pedidos lado a
 * lado. (Dentro de la columna de 480 px el panel repartía tres columnas de 144 px y los platos salían cortados.)
 * Exigen sesión y llevan el aviso de pedidos de clientes, como las demás pantallas del personal.
 */
export default async function LayoutCocina({ children }: LayoutProps<"/">) {
  await exigirSesion();
  return (
    <div className="min-h-dvh bg-fondo">
      <AlertaPedidosClientes />
      {children}
    </div>
  );
}
