"use client";

import { Delete } from "lucide-react";
import { FILAS_TECLADO, type Tecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";

/**
 * Teclado numérico en pantalla para montos (efectivo recibido, propina, abono). No usa el teclado del sistema:
 * así nunca tapa el botón principal, responde al instante y no provoca zoom. Teclas de 48 px mínimo.
 *
 * Solo avisa QUÉ tecla se tocó (`onTecla`); quien lo usa la aplica con `setValor((v) => aplicarTecla(v, tecla))`,
 * así cada toque se suma al valor más reciente aunque lleguen dos seguidos antes de volver a dibujar.
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
