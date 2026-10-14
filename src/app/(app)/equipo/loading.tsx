import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoEquipo() {
  return (
    <>
      <EncabezadoPantalla titulo="Equipo" atras="/mas" />
      <main className="pb-nav-accion space-y-2 px-4 pt-3" aria-busy="true" aria-label="Cargando el equipo">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-16 w-full" />
      </main>
    </>
  );
}
