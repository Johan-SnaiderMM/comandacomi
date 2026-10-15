"use client";

import { cn } from "@/lib/utils";

type Opcion<T extends string> = { valor: T; etiqueta: string; icono?: React.ReactNode };

/**
 * Control segmentado (elige una opción de pocas): botones grandes de 48 px, el elegido relleno de amarillo.
 * Es un grupo de radios accesible; sin hover, solo toque.
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className,
}: {
  opciones: Opcion<T>[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-tinta px-1 text-base font-bold leading-tight transition-[transform,box-shadow] duration-75",
              "active:translate-y-[2px] active:shadow-none",
              activo ? "bg-sol shadow-sello-chico" : "bg-papel text-tinta-2"
            )}
          >
            {o.icono}
            <span>{o.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
