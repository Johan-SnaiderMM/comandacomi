import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerPlancha } from "@/lib/datos/clientes";
import { revisarPermiso } from "@/lib/permisos";
import { PanelPlancha } from "./panel-plancha";

export const metadata = { title: "Plancha" };

/**
 * Panel de la plancha (cocina): los pedidos por preparar, plato por plato. La primera carga viene del servidor; después
 * el panel se actualiza solo (ver panel-plancha.tsx).
 */
export default async function PaginaPlancha() {
  if (!(await revisarPermiso("plancha")).permitido) {
    // La plancha va a todo el ancho; el aviso, en la columna de celular como el resto de la app.
    return (
      <div className="columna-app">
        <SinPermiso pantalla="plancha" />
      </div>
    );
  }
  const plancha = await obtenerPlancha();
  return <PanelPlancha inicial={plancha} />;
}
