import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoNuevoGasto() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <EncabezadoPantalla titulo="Nuevo gasto" atras="/gastos" />
      <main className="space-y-3 px-4 pt-3">
        <p role="status" className="text-base text-tinta-2">
          Cargando…
        </p>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-12 w-full" />
      </main>
    </div>
  );
}
