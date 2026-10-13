"use client";

import { useEffect } from "react";
import { useIr } from "@/lib/navegacion";

/**
 * Mantiene una pantalla del personal "en vivo": cada `cadaMs` pide los datos de nuevo al servidor (solo si la pantalla
 * está a la vista y hay señal). Así lo que hace la plancha (platos listos) o un cliente (pedido nuevo) aparece solo,
 * sin tener que recargar. No pinta nada.
 */
export function ActualizadorEnVivo({ cadaMs = 8000 }: { cadaMs?: number }) {
  const ir = useIr();

  useEffect(() => {
    const actualizar = () => {
      if (document.visibilityState === "visible" && navigator.onLine) ir.refresh();
    };
    const reloj = window.setInterval(actualizar, cadaMs);
    window.addEventListener("clientes:cambio", actualizar);
    document.addEventListener("visibilitychange", actualizar);
    return () => {
      window.clearInterval(reloj);
      window.removeEventListener("clientes:cambio", actualizar);
      document.removeEventListener("visibilitychange", actualizar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ir` cambia de identidad en cada render y solo envuelve router.refresh
  }, [cadaMs]);

  return null;
}
