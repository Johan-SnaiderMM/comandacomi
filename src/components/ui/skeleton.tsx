import * as React from "react";
import { cn } from "@/lib/utils";

/** Esqueleto de carga: solo opacidad (barato en gama baja) y se detiene con «reducir movimiento». */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-tinta/10", className)} {...props} />;
}
