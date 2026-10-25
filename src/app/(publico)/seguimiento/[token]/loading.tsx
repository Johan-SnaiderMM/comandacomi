import { Skeleton } from "@/components/ui/skeleton";

/** Mientras se busca el pedido del cliente: la forma del seguimiento, no un blanco. */
export default function CargandoSeguimiento() {
  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <p className="text-sm font-bold uppercase tracking-wide">Seguimiento de tu pedido</p>
        <Skeleton className="mt-1 h-10 w-3/4 bg-tinta/15" />
        <Skeleton className="mt-2 h-6 w-1/2 bg-tinta/15" />
      </header>
      <main className="space-y-4 px-4 pt-4 pb-10" aria-busy="true">
        <p role="status" className="text-base text-tinta-2">
          Buscando tu pedido…
        </p>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    </>
  );
}
