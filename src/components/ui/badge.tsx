import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Chip de estado. El significado nunca depende solo del color: siempre lleva texto. */
const badgeVariantes = cva(
  "inline-flex items-center gap-1 rounded-full border-2 border-tinta px-2.5 py-0.5 text-sm font-bold leading-tight",
  {
    variants: {
      variante: {
        neutro: "bg-papel text-tinta",
        sol: "bg-sol text-tinta",
        aji: "bg-aji text-papel",
        listo: "bg-listo text-papel",
      },
    },
    defaultVariants: { variante: "neutro" },
  }
);

export function Badge({
  className,
  variante,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariantes>) {
  return <span className={cn(badgeVariantes({ variante }), className)} {...props} />;
}
