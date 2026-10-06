import { obtenerCierreDelDia } from "@/lib/datos/gastos";
import { obtenerContexto, obtenerInicio } from "@/lib/datos/inicio";
import { hoyBogota } from "@/lib/fechas";
import { CierreDia } from "./cierre-dia";

export const metadata = { title: "Cierre del día" };

export default async function PaginaCierre() {
  const [datos, inicio, contexto] = await Promise.all([obtenerCierreDelDia(), obtenerInicio(), obtenerContexto()]);
  return <CierreDia datos={datos} porCobrar={inicio.por_cobrar} restaurante={contexto.restaurante?.nombre ?? "Mi restaurante"} hoy={hoyBogota()} />;
}
