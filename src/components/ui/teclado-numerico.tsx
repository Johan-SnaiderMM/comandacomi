"use client";

import { Delete } from "lucide-react";
import { FILAS_TECLADO, type Tecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";

/**
 * Teclado de montos en pantalla: el del sistema tapaba el botón principal. Solo avisa qué tecla se tocó; aplícala con
 * `setValor((v) => aplicarTecla(v, tecla))` para no perder dos toques seguidos.
 */
export function TecladoNumerico({ onTecla, className }: { onTecla: (tecla: Tecla) => void; className?: string }) {
  return (
    <div role="group" aria-label="Teclado numérico" className={cn("grid grid-cols-3 gap-1.5", className)}>
      {FILAS_TECLADO.flat().map((tecla: Tecla) => (
        <button
          key={tecla}
          type="button"
          aria-label={tecla === "borrar" ? "Borrar" : tecla}
          onClick={() => onTecla(tecla)}
          className={cn(
            "flex min-h-12 items-center justify-center rounded-xl border-2 border-tinta font-display text-3xl font-extrabold leading-none shadow-sello-chico",
            "transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none",
            tecla === "borrar" ? "bg-tinta/10" : "bg-papel"
          )}
        >
          {tecla === "borrar" ? <Delete className="size-7" aria-hidden /> : tecla}
        </button>
      ))}
    </div>
  );
}
