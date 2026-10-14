import { Eye } from "lucide-react";
import { dejarDeVerComo } from "@/app/acciones/equipo";

/**
 * Mientras el dueño mira la app como la ve un rol ("Ver como", en Más): se lo recuerda arriba de cada pantalla, con la
 * vuelta a un toque. Así nunca queda atrapado en una vista con menos cosas.
 */
export function BandaVerComo({ nombre }: { nombre: string }) {
  return (
    <form
      action={dejarDeVerComo}
      className="flex items-center justify-between gap-2 border-b-2 border-tinta bg-tinta px-3 pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] text-papel"
    >
      <p className="flex min-w-0 items-center gap-2 text-base font-bold leading-tight">
        <Eye className="size-5 shrink-0" aria-hidden />
        <span>
          Viendo la app como <span className="text-sol">{nombre}</span>
        </span>
      </p>
      <button type="submit" className="min-h-12 shrink-0 rounded-xl border-2 border-papel px-3 text-base font-bold active:bg-papel/20">
        Volver a dueño
      </button>
    </form>
  );
}
