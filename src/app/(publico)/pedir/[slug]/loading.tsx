import { Skeleton } from "@/components/ui/skeleton";

/** Mientras llega el menú (el cliente suele abrirlo con datos móviles desde el QR): la forma de la página, no un blanco. */
export default function CargandoMenu() {
  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <p className="text-sm font-bold uppercase tracking-wide">Pide en línea · pagas al recibir</p>
        <Skeleton className="mt-2 h-11 w-3/4 bg-tinta/15" />
      </header>
      <main className="space-y-4 px-4 pt-3 pb-8" aria-busy="true">
        <p role="status" className="text-base text-tinta-2">
          Cargando el menú…
        </p>
        <div className="flex gap-2">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-12 w-24" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    </>
  );
}
