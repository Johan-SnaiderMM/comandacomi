import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoPlancha() {
  return (
    <>
      <EncabezadoPantalla titulo="Plancha" atras="/inicio" />
      <main className="space-y-3 px-4 pt-3" aria-busy="true" aria-label="Cargando la plancha">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </main>
    </>
  );
}
