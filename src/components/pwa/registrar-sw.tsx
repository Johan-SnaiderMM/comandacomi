"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción: en desarrollo estorba al recargar en caliente). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sin service worker la app funciona igual; solo se pierde el arranque rápido con mala señal.
    });
  }, []);

  return null;
}
