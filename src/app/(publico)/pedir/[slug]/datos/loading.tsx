import { Skeleton } from "@/components/ui/skeleton";

/** Mientras llega la política de datos del restaurante. */
export default function CargandoPolitica() {
  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-4 pb-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px))]">
        <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight">Tus datos</h1>
      </header>
      <main className="space-y-4 px-4 pt-4 pb-10" aria-busy="true">
        <p role="status" className="text-base text-tinta-2">
          Cargando…
        </p>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-28 w-full" />
      </main>
    </>
  );
}
