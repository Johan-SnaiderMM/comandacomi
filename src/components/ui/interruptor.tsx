"use client";

import { cn } from "@/lib/utils";

/**
 * Interruptor (sí/no) de al menos 48 px de alto. El estado se dice con TEXTO además del color
 * ("Hay" / "Agotado"), así se lee bien al sol y sin depender de distinguir colores.
 */
export function Interruptor({
  activo,
  onCambio,
  etiqueta,
  textoActivo,
  textoInactivo,
  disabled,
  className,
}: {
  activo: boolean;
  onCambio: (nuevo: boolean) => void;
  etiqueta: string;
  textoActivo: string;
  textoInactivo: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambio(!activo)}
      className={cn("flex min-h-12 w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl active:bg-tinta/10 disabled:opacity-50", className)}
    >
      <span aria-hidden className={cn("flex h-7 w-12 items-center rounded-full border-2 border-tinta px-0.5", activo ? "justify-end bg-listo" : "justify-start bg-papel")}>
        <span className="size-5 rounded-full border-2 border-tinta bg-papel" />
      </span>
      <span className={cn("text-sm font-bold leading-none", activo ? "text-listo" : "text-aji")}>{activo ? textoActivo : textoInactivo}</span>
    </button>
  );
}
