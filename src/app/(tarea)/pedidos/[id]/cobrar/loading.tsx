import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoCobro() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-label="Cargando el cobro">
      <EncabezadoPantalla titulo="Cobrar" atras="/pedidos" />
      <main className="flex flex-col gap-2.5 px-4 pt-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-52 w-full" />
      </main>
    </div>
  );
}
