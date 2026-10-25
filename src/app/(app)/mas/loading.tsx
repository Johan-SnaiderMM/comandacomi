import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoMas() {
  return (
    <>
      <EncabezadoPantalla titulo="Más" />
      <main className="pb-nav space-y-3 px-4 pt-4" aria-busy="true">
        <p role="status" className="text-base text-tinta-2">
          Cargando…
        </p>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    </>
  );
}
