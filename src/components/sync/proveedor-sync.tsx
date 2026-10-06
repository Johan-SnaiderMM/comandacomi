"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { obtenerMotor } from "@/lib/sync/cliente";

/** Con qué frecuencia se revisa si hay algo por subir o si la copia local quedó vieja. */
const REVISION_MS = 30_000;
const COPIA_VIEJA_MS = 60_000;

/**
 * Mantiene el trabajo sin conexión andando mientras la app está abierta (no pinta nada): sube lo pendiente apenas
 * vuelve la señal o la app vuelve a primer plano, y mantiene fresca la copia local (menú, pendientes, clientes).
 * En la portada no hace nada (todavía no hay sesión).
 */
export function ProveedorSync() {
  const enPortada = usePathname() === "/";

  useEffect(() => {
    if (enPortada) return;
    const motor = obtenerMotor();
    if (!motor) return;

    const sincronizar = () => {
      if (!navigator.onLine) return;
      void (motor.porSubir() > 0 ? motor.vaciar() : motor.refrescar());
    };

    const revisar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const e = motor.estado();
      const guardado = e.snapshot ? Date.parse(e.snapshot.guardadoEn) : 0;
      const hayAlgoQueSubir = motor.porSubir() > 0 || e.ops.some((o) => o.estado === "enviada") || e.sinRed;
      if (hayAlgoQueSubir || Date.now() - guardado > COPIA_VIEJA_MS) sincronizar();
    };

    sincronizar();
    const reloj = window.setInterval(revisar, REVISION_MS);
    window.addEventListener("online", sincronizar);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      window.clearInterval(reloj);
      window.removeEventListener("online", sincronizar);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [enPortada]);

  return null;
}
