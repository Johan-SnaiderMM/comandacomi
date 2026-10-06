"use client";

import { useEffect } from "react";
import { avanzarDesde } from "@/lib/guia";

/**
 * Se pone en una pantalla que confirma que el usuario ya hizo lo que pedía el paso `desde` (por ejemplo, el cobro):
 * la guía pasa sola al paso siguiente. `espera` deja ver primero la pantalla (el vuelto, por ejemplo).
 */
export function AvanzaGuia({ desde, espera = 0 }: { desde: number; espera?: number }) {
  useEffect(() => {
    const reloj = window.setTimeout(() => avanzarDesde(desde), espera);
    return () => window.clearTimeout(reloj);
  }, [desde, espera]);
  return null;
}
