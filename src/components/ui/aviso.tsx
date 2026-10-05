"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Aviso en línea (éxito o error). Los errores usan role="alert" para que el lector de pantalla los lea. */
export function Aviso({
  tipo,
  children,
  onCerrar,
  className,
}: {
  tipo: "ok" | "error";
  children: React.ReactNode;
  onCerrar?: () => void;
  className?: string;
}) {
  const Icono = tipo === "ok" ? CircleCheck : CircleAlert;
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border-2 border-tinta p-3 text-base font-bold",
        tipo === "ok" ? "bg-listo-suave" : "bg-aji-suave",
        className
      )}
    >
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="flex-1 leading-snug">{children}</p>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="-m-3 flex size-12 shrink-0 items-center justify-center">
          <X className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
