import Link from "next/link";
import { Plus } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { botonVariantes } from "@/components/ui/button";
import { listarGastos } from "@/lib/datos/gastos";
import { ListaGastos } from "./lista-gastos";

export const metadata = { title: "Gastos" };

export default async function Gastos({ searchParams }: PageProps<"/gastos">) {
  const sp = await searchParams;
  const guardado = typeof sp.guardado === "string" ? Number(sp.guardado) : NaN;
  const dia = await listarGastos();

  return (
    <>
      <EncabezadoPantalla titulo="Gastos del día" atras="/inicio" />
      <main className="pb-nav-accion">
        <ListaGastos dia={dia} guardado={Number.isInteger(guardado) && guardado > 0 ? guardado : null} />
      </main>
      <BarraAccion sobreNav>
        <Link href="/gastos/nuevo" className={botonVariantes({ tamano: "lg", bloque: true })}>
          <Plus className="size-6" strokeWidth={3} aria-hidden /> Registrar gasto
        </Link>
      </BarraAccion>
    </>
  );
}
