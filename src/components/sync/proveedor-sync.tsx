"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { obtenerPulso } from "@/lib/pulso";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { obtenerMotor } from "@/lib/sync/cliente";

/** Con qué frecuencia se revisa (sin preguntarle nada al servidor) si hay algo por subir o si la copia quedó vieja. */
const REVISION_MS = 30_000;
/** Aunque nada de los pedidos cambie, la copia se renueva cada 5 minutos (el menú y los clientes no tienen huella). */
const COPIA_VIEJA_MS = 5 * 60_000;
/** Por cambios de otros (la huella del pulso), como mucho una copia nueva cada 30 s. */
const ENTRE_COPIAS_MS = 30_000;

/**
 * Mantiene el trabajo sin conexión andando mientras la app está abierta (no pinta nada): sube lo pendiente apenas
 * vuelve la señal o la app vuelve a primer plano, y mantiene fresca la copia local (menú, pendientes, clientes).
 * Para saber si la copia quedó vieja escucha el pulso de la pestaña (`lib/pulso.ts`) sin pedirle consultas: si la
 * huella de los pedidos ya no es la de la copia, la renueva.
 * En la portada no hace nada (todavía no hay sesión) ni en las páginas del cliente (pedir y seguir su pedido).
 */
export function ProveedorSync() {
  const ruta = usePathname();
  const enPortada = ruta === "/" || esRutaPublica(ruta);

  useEffect(() => {
    if (enPortada) return;
    const motor = obtenerMotor();
    if (!motor) return;

    // En la pantalla de "no existe" no se sincroniza: una acción del servidor lanzada desde una dirección que no
    // existe falla, y el motor lo tomaría por falta de señal (aviso de "Sin conexión" en la pantalla siguiente).
    const enPantallaQueNoExiste = () => document.querySelector("[data-pantalla='no-existe']") !== null;

    const sincronizar = () => {
      if (!navigator.onLine || enPantallaQueNoExiste()) return;
      void (motor.porSubir() > 0 ? motor.vaciar() : motor.refrescar());
    };

    const edadDeLaCopia = () => {
      const s = motor.estado().snapshot;
      return s ? Date.now() - Date.parse(s.guardadoEn) : Infinity;
    };

    const revisar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const e = motor.estado();
      const hayAlgoQueSubir = motor.porSubir() > 0 || e.ops.some((o) => o.estado === "enviada") || e.sinRed;
      if (hayAlgoQueSubir || edadDeLaCopia() > COPIA_VIEJA_MS) sincronizar();
    };

    sincronizar();
    const reloj = window.setInterval(revisar, REVISION_MS);
    window.addEventListener("online", sincronizar);
    document.addEventListener("visibilitychange", revisar);
    let intentoPorPulso = 0; // si la copia no se pudo traer, no se insiste en cada pulso
    const dejarElPulso = obtenerPulso()?.escuchar({
      ritmo: () => null, // solo escucha: el pulso lo piden el aviso, Pendientes o la plancha
      alPulso: (p) => {
        if (p.huella === motor.estado().snapshot?.huella) return;
        if (edadDeLaCopia() < ENTRE_COPIAS_MS || Date.now() - intentoPorPulso < ENTRE_COPIAS_MS) return;
        intentoPorPulso = Date.now();
        sincronizar();
      },
    });
    return () => {
      window.clearInterval(reloj);
      window.removeEventListener("online", sincronizar);
      document.removeEventListener("visibilitychange", revisar);
      dejarElPulso?.();
    };
  }, [enPortada]);

  return null;
}
