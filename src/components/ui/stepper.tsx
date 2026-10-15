"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cantidad con − y + de 48 px (para tocar con el pulgar). Con `minimo` en 0, − quita el plato. */
export function Stepper({
  valor,
  onCambio,
  minimo = 1,
  maximo = 99,
  etiqueta,
  className,
}: {
  valor: number;
  onCambio: (nuevo: number) => void;
  minimo?: number;
  maximo?: number;
  etiqueta: string;
  className?: string;
}) {
  const boton =
    "flex size-12 items-center justify-center rounded-xl border-2 border-tinta bg-papel shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none disabled:shadow-none disabled:border-dashed disabled:border-tinta/50 disabled:bg-fondo disabled:text-tinta-2";
  return (
    <div role="group" aria-label={etiqueta} className={cn("inline-flex items-center gap-1.5", className)}>
      <button type="button" aria-label={`Menos ${etiqueta}`} className={boton} disabled={valor <= minimo} onClick={() => onCambio(valor - 1)}>
        <Minus className="size-5" strokeWidth={3} aria-hidden />
      </button>
      <span aria-live="polite" className="cifra min-w-9 text-center text-2xl">
        {valor}
      </span>
      <button type="button" aria-label={`Más ${etiqueta}`} className={boton} disabled={valor >= maximo} onClick={() => onCambio(valor + 1)}>
        <Plus className="size-5" strokeWidth={3} aria-hidden />
      </button>
    </div>
  );
}
