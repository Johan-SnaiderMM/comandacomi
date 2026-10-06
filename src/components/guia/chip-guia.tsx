"use client";

import { useSyncExternalStore } from "react";
import { Lightbulb } from "lucide-react";
import { abrirGuia, leerGuia, leerGuiaServidor, PASOS, suscribirGuia } from "@/lib/guia";

/** Ficha del encabezado mientras el recorrido está activo: "paso 3 de 9". Al tocarla se vuelve a ver la instrucción. */
export function ChipGuia() {
  const estado = useSyncExternalStore(suscribirGuia, leerGuia, leerGuiaServidor);
  if (!estado || estado.abierta) return null;
  return (
    <button
      type="button"
      onClick={abrirGuia}
      aria-label={`Recorrido guiado, paso ${estado.paso + 1} de ${PASOS.length}. Toca para ver la instrucción`}
      className="tap flex shrink-0 items-center justify-center"
    >
      <span className="flex h-9 items-center gap-1 rounded-full border-2 border-tinta bg-sol px-2.5 text-base font-extrabold leading-none shadow-sello-chico">
        <Lightbulb className="size-4" strokeWidth={2.75} aria-hidden />
        {estado.paso + 1}/{PASOS.length}
      </span>
    </button>
  );
}
