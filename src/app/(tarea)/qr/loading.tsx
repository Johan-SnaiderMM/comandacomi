import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoQr() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <EncabezadoPantalla titulo="QR para imprimir" atras="/pedidos-en-linea" />
      <main className="space-y-4 px-4 pt-4 pb-8">
        <p role="status" className="text-base text-tinta-2">
          Armando el cartel…
        </p>
        <Skeleton className="mx-auto aspect-square w-64" />
        <Skeleton className="h-14 w-full" />
      </main>
    </div>
  );
}
