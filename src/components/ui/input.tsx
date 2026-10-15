import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de texto de 48 px mínimo y 16 px de letra (no provoca zoom al enfocar).
 * Autocompletar apagado por defecto: en una caja registradora estorba más de lo que ayuda.
 */
export function Input({ className, type = "text", autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      className={cn(
        "min-h-12 w-full rounded-xl border-2 border-tinta bg-papel px-3 text-base text-tinta placeholder:text-tinta-2/70",
        "disabled:border-dashed disabled:bg-fondo disabled:text-tinta-2",
        className
      )}
      {...props}
    />
  );
}

/** Área de texto con las mismas reglas (notas largas). */
export function Textarea({ className, autoComplete = "off", ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      autoComplete={autoComplete}
      className={cn(
        "min-h-24 w-full rounded-xl border-2 border-tinta bg-papel px-3 py-2 text-base text-tinta placeholder:text-tinta-2/70",
        className
      )}
      {...props}
    />
  );
}
