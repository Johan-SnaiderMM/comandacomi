import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoMesas() {
  return (
    <>
      <EncabezadoPantalla titulo="Mesas" atras="/mas" />
      <main className="pb-nav-accion space-y-2 px-4 pt-3" aria-busy="true" aria-label="Cargando las mesas">
        <Skeleton className="h-7 w-48" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </main>
    </>
  );
}
