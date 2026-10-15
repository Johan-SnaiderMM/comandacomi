import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botón "tecla de caja registradora": borde grueso y sombra dura que se hunde al tocar.
 * Tamaños táctiles: md = 48 px, lg = 56 px. Sin hover: el feedback es el hundimiento inmediato.
 * Apagado: borde punteado, fondo gris y sin sombra, pero con el texto LEGIBLE (dice qué falta, p. ej. "Cuenta el
 * efectivo para cerrar"); antes se ponía al 40 % de opacidad y no se alcanzaba a leer.
 */
export const botonVariantes = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 rounded-xl border-2 border-tinta text-center font-bold leading-tight",
    "transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none",
    "disabled:pointer-events-none disabled:shadow-none disabled:border-dashed disabled:border-tinta/50 disabled:bg-fondo disabled:text-tinta-2",
  ],
  {
    variants: {
      variante: {
        primario: "bg-sol text-tinta shadow-sello",
        oscuro: "bg-tinta text-papel shadow-sello",
        secundario: "bg-papel text-tinta shadow-sello",
        exito: "bg-listo text-papel shadow-sello",
        peligro: "bg-aji text-papel shadow-sello",
        fantasma: "border-transparent bg-transparent text-tinta shadow-none active:translate-y-0 active:bg-tinta/10",
      },
      tamano: {
        md: "min-h-12 px-4 text-base",
        lg: "min-h-14 px-5 text-lg",
        icono: "size-12 p-0",
      },
      bloque: { true: "w-full", false: "" },
    },
    defaultVariants: { variante: "primario", tamano: "md", bloque: false },
  }
);

export type BotonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof botonVariantes>;

export function Button({ className, variante, tamano, bloque, type = "button", ...props }: BotonProps) {
  return <button type={type} className={cn(botonVariantes({ variante, tamano, bloque }), className)} {...props} />;
}
