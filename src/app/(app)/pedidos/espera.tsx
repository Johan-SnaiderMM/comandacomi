"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { minutosDesde, textoEspera } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Tiempo de espera de un pedido. El primer valor se calcula con la hora del servidor (así el HTML del servidor
 * y el del celular coinciden) y después se actualiza cada 30 s con el reloj del celular.
 * Pasa a rojo a los 20 min (es lo que la cocina debe atender primero); si ya se entregó, solo falta cobrar
 * y no se marca como urgente (`alertar` = false).
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
