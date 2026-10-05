import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto con la misma forma que Inicio: el contenido no salta cuando llegan los datos. */
export default function CargandoInicio() {
  return (
    <>
      <EncabezadoPantalla titulo="Inicio" />
      <main className="pb-nav space-y-4 px-4 pt-4" aria-busy="true" aria-label="Cargando">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-52 w-full" />
        <Skeleton className="mx-auto h-4 w-64" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </main>
    </>
  );
}
