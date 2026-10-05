import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoPendientes() {
  return (
    <>
      <EncabezadoPantalla titulo="Pendientes" />
      <main className="pb-nav space-y-4 px-4 pt-3" aria-busy="true" aria-label="Cargando pedidos">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-60 w-full" />
        ))}
      </main>
    </>
  );
}
