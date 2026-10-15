"use client";

import { useEffect, useRef } from "react";
import { useIr } from "@/lib/navegacion";
import { obtenerPulso } from "@/lib/pulso";
import { RITMO_PENDIENTES, type Ritmo } from "@/lib/ritmo";

/**
 * Mantiene una pantalla del personal "en vivo" sin pedirlo todo cada pocos segundos: escucha el pulso de la pestaña
 * (`lib/pulso.ts`) y solo vuelve a pedir la pantalla al servidor cuando la huella de los pedidos cambió (lo que hace
 * la plancha, la caja o un cliente). `huella` es la que traía la pantalla al armarse. No pinta nada.
 */
export function ActualizadorEnVivo({ huella, ritmo = RITMO_PENDIENTES }: { huella: string | null; ritmo?: Ritmo }) {
  const ir = useIr();
  const conocida = useRef(huella);

  // Cada vez que la pantalla se vuelve a armar (por el pulso o por una acción propia) trae su huella nueva.
  useEffect(() => {
    conocida.current = huella;
  }, [huella]);

  useEffect(() => {
    const pulso = obtenerPulso();
    if (!pulso) return;
    return pulso.escuchar({
      ritmo: () => ritmo,
      alPulso: (p) => {
        if (p.huella === conocida.current || !navigator.onLine) return;
        conocida.current = p.huella; // no pedirla dos veces mientras llega
        ir.refresh();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ir` cambia de identidad en cada render y solo envuelve router.refresh
  }, [ritmo]);

  return null;
}
