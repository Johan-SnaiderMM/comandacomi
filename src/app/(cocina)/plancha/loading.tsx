import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoPlancha() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <EncabezadoPantalla titulo="Plancha" atras="/inicio" />
      <main className="grid gap-3 px-3 pt-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando la plancha">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </main>
    </div>
  );
}
