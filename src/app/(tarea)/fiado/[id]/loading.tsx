import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoCliente() {
  return (
    <>
      <EncabezadoPantalla titulo="Cliente" atras="/fiado" />
      <main className="space-y-4 px-4 pt-3" aria-busy="true" aria-label="Cargando el cliente">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </main>
    </>
  );
}
