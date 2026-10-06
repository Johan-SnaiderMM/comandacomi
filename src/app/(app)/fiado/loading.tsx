import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoFiado() {
  return (
    <>
      <EncabezadoPantalla titulo="Fiado" />
      <main className="pb-nav space-y-4 px-4 pt-3" aria-busy="true" aria-label="Cargando el fiado">
        <Skeleton className="h-32 w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </main>
    </>
  );
}
