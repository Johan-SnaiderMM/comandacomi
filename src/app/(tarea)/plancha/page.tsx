import { obtenerPlancha } from "@/lib/datos/clientes";
import { PanelPlancha } from "./panel-plancha";

export const metadata = { title: "Plancha" };

/**
 * Panel de la plancha (cocina): los pedidos por preparar, plato por plato. La primera carga viene del servidor; después
 * el panel se actualiza solo (ver panel-plancha.tsx).
 */
export default async function PaginaPlancha() {
  const plancha = await obtenerPlancha();
  return <PanelPlancha inicial={plancha} />;
}
