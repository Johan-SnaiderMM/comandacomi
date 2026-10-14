import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerCierreDelDia } from "@/lib/datos/gastos";
import { obtenerInicio } from "@/lib/datos/inicio";
import { revisarPermiso } from "@/lib/permisos";
import { CierreDia } from "./cierre-dia";

export const metadata = { title: "Cierre del día" };

/**
 * Cierre del DÍA DE TRABAJO: el que dice el reloj con la hora de corte (a la 1:44 a. m. todavía es el de anoche). Recién
 * cerrado se sigue viendo ese día, con sus cifras guardadas; la página nueva empieza a la hora de corte.
 */
export default async function PaginaCierre() {
  const { contexto, permitido } = await revisarPermiso("cierre");
  if (!permitido) return <SinPermiso pantalla="cierre" />;
  const [datos, inicio] = await Promise.all([obtenerCierreDelDia(), obtenerInicio()]);
  return (
    <CierreDia
      datos={datos}
      porCobrar={inicio.por_cobrar ?? 0}
      restaurante={contexto.restaurante?.nombre ?? "Mi restaurante"}
      horaCorte={contexto.restaurante?.hora_corte}
    />
  );
}
