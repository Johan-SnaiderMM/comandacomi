import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoGastos() {
  return (
    <>
      <EncabezadoPantalla titulo="Gastos del día" atras="/inicio" />
      <main className="pb-nav-accion space-y-3 px-4 pt-3" aria-busy="true" aria-label="Cargando gastos">
        <Skeleton className="h-28 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </main>
    </>
  );
}
