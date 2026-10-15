import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerCierreDelDia } from "@/lib/datos/gastos";
import { obtenerInicio } from "@/lib/datos/inicio";
import { revisarPermiso } from "@/lib/permisos";
import { CierreDia } from "./cierre-dia";

export const metadata = { title: "Cierre del día" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cierre del DÍA DE TRABAJO: el que dice el reloj con la hora de corte (a la 1:44 a. m. todavía es el de anoche). Recién
 * cerrado se sigue viendo ese día, con sus cifras guardadas; la página nueva empieza a la hora de corte.
 * Con `?fecha=YYYY-MM-DD` muestra (y deja cerrar) un día anterior que quedó abierto: la pantalla lo ofrece sola.
 */
export default async function PaginaCierre({ searchParams }: PageProps<"/cierre">) {
  const { contexto, permitido } = await revisarPermiso("cierre");
  if (!permitido) return <SinPermiso pantalla="cierre" />;
  const sp = await searchParams;
  const fecha = typeof sp.fecha === "string" && FECHA.test(sp.fecha) ? sp.fecha : null;
  const [datos, inicio] = await Promise.all([obtenerCierreDelDia(fecha), obtenerInicio()]);
  return (
    <CierreDia
      // Al cambiar de día, la pantalla empieza de cero (la base y lo contado son de ese día).
      key={fecha ?? "hoy"}
      datos={datos}
      fechaElegida={fecha}
      porCobrar={inicio.por_cobrar ?? 0}
      restaurante={contexto.restaurante?.nombre ?? "Mi restaurante"}
      horaCorte={contexto.restaurante?.hora_corte}
    />
  );
}
