import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoMenu() {
  return (
    <>
      <EncabezadoPantalla titulo="Menú" atras="/mas" />
      <main className="pb-nav-accion space-y-3 px-4 pt-3" aria-busy="true" aria-label="Cargando el menú">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-7 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </main>
    </>
  );
}
