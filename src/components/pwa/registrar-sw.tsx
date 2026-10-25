"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { esRutaPublica } from "@/lib/rutas-publicas";

/** Cada cuánto se vuelve a guardar la app sin conexión (se actualiza con cada versión nueva). */
const PRECARGA_CADA_MS = 6 * 60 * 60 * 1000;
const CLAVE_PRECARGA = "sc:precarga";

/**
 * Registra el service worker solo en producción (en desarrollo, con NEXT_PUBLIC_SW_EN_DEV=1) y le pide guardar la app
 * sin conexión. Nunca en las páginas del cliente: bajar la app del personal le gastaría datos.
 */
export function RegistrarServiceWorker() {
  const publica = esRutaPublica(usePathname());

  useEffect(() => {
    const activo = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_EN_DEV === "1";
    if (publica || !activo || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registro) => {
        if (!navigator.onLine) return;
        let ultima = 0;
        try {
          ultima = Number(window.localStorage.getItem(CLAVE_PRECARGA)) || 0;
        } catch {
          // sin localStorage: se precarga en cada visita
        }
        if (Date.now() - ultima < PRECARGA_CADA_MS) return;
        registro.active?.postMessage("precargar");
        try {
          window.localStorage.setItem(CLAVE_PRECARGA, String(Date.now()));
        } catch {
          // ver arriba
        }
      })
      .catch(() => {
        // Sin service worker la app funciona igual; solo se pierde abrir sin señal.
      });
  }, [publica]);

  return null;
}
