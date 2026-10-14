import { SinPermiso } from "@/components/layout/sin-permiso";
import { revisarPermiso } from "@/lib/permisos";
import { NuevoGasto } from "./nuevo-gasto";

export const metadata = { title: "Nuevo gasto" };

export default async function PaginaNuevoGasto() {
  if (!(await revisarPermiso("gastos")).permitido) return <SinPermiso pantalla="gastos" />;
  return <NuevoGasto />;
}
