"use client";

import { useSyncExternalStore } from "react";
import { iniciarGuia, leerGuia, leerGuiaServidor, suscribirGuia } from "@/lib/guia";

/** Inicia el recorrido guiado. Se oculta mientras el recorrido está en marcha (la ficha del encabezado lo reemplaza). */
export function BotonGuia({ className, children }: { className?: string; children: React.ReactNode }) {
  const activa = useSyncExternalStore(suscribirGuia, leerGuia, leerGuiaServidor) !== null;
  if (activa) return null;
  return (
    <button type="button" className={className} onClick={iniciarGuia}>
      {children}
    </button>
  );
}
