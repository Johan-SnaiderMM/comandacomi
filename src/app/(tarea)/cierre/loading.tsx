import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoCierre() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-label="Cargando el cierre">
      <EncabezadoPantalla titulo="Cierre del día" atras="/inicio" />
      <main className="space-y-3 px-4 pt-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-14 w-full" />
      </main>
    </div>
  );
}
