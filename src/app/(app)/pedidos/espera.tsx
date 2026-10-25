"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { minutosDesde, textoEspera } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Espera de un pedido: arranca con la hora del servidor (para que coincidan los dos HTML) y sigue con el reloj del
 * celular. Pasa a rojo a los 20 min, salvo si ya se entregó y solo falta cobrar (`alertar` = false).
 */
export function Espera({ desde, ahora, alertar = true }: { desde: string; ahora: string; alertar?: boolean }) {
  const [min, setMin] = useState(() => minutosDesde(desde, new Date(ahora).getTime()));

  useEffect(() => {
    const id = setInterval(() => setMin(minutosDesde(desde)), 30_000);
    return () => clearInterval(id);
  }, [desde]);

  return (
    <span className={cn("inline-flex items-center gap-1 text-base", !alertar ? "text-tinta-2" : min >= 20 ? "font-extrabold text-aji" : min >= 10 ? "font-bold" : "text-tinta-2")}>
      <Clock className="size-4" aria-hidden />
      <span className="sr-only">Espera: </span>
      {textoEspera(min)}
    </span>
  );
}
