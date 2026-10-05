import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto con la forma de la pantalla: cabecera, riel de categorías y rejilla de platos. */
export default function CargandoTomarPedido() {
  return (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-label="Cargando el menú">
      <div className="flex min-h-14 items-center gap-3 border-b-2 border-tinta px-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="ml-auto h-12 w-36" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[68px] shrink-0 space-y-px border-r-2 border-tinta">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-none" />
          ))}
        </div>
        <div className="flex-1 space-y-2 p-2">
          <Skeleton className="h-7 w-32" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
