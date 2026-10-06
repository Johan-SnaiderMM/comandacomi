"use client";

import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { botonVariantes } from "@/components/ui/button";
import { Enlace, useEnAppSinConexion } from "@/lib/navegacion";
import { useEnLinea, useResumenSync } from "@/lib/sync/cliente";
import { cn } from "@/lib/utils";

/**
 * Franja de estado de la conexión, arriba de cada pantalla. Solo aparece cuando hay algo que decir:
 * sin señal (se sigue trabajando y se sube después), subiendo, o cambios que el servidor rechazó.
 */
export function BandaSync() {
  const enLinea = useEnLinea();
  const { porSubir, conProblema, sincronizando, sinRed, sinSesion } = useResumenSync();
  const enSC = useEnAppSinConexion();
  const sinSenal = !enLinea || sinRed;
  const hrefRevisar = enSC ? "/sincronizacion" : "/sc#/sincronizacion";

  if (sinSesion && porSubir > 0) {
    return (
      <Franja tono="alerta" icono={<TriangleAlert className="size-5 shrink-0" aria-hidden />}>
        Vuelve a entrar para subir {porSubir === 1 ? "1 cambio" : `${porSubir} cambios`}.
      </Franja>
    );
  }
  if (conProblema > 0) {
    return (
      <Franja tono="alerta" icono={<TriangleAlert className="size-5 shrink-0" aria-hidden />}>
        <span className="flex-1">{conProblema === 1 ? "1 cambio no se pudo subir" : `${conProblema} cambios no se pudieron subir`}</span>
        <Enlace href={hrefRevisar} className={botonVariantes({ variante: "secundario", tamano: "md", className: "shrink-0 text-tinta" })}>
          Revisar
        </Enlace>
      </Franja>
    );
  }
  if (sinSenal) {
    return (
      <Franja tono="aviso" icono={<CloudOff className="size-5 shrink-0" aria-hidden />}>
        Sin conexión · {porSubir > 0 ? `${porSubir} por subir` : "sigues trabajando con lo guardado"}
      </Franja>
    );
  }
  if (porSubir > 0 || sincronizando) {
    return (
      <Franja tono="neutro" icono={<RefreshCw className="size-5 shrink-0 motion-safe:animate-spin" aria-hidden />}>
        Subiendo {porSubir > 0 ? porSubir : ""}…
      </Franja>
    );
  }
  if (enSC) {
    return (
      <a href="/inicio" className="flex min-h-12 items-center gap-2 border-b-2 border-tinta bg-listo px-3 text-base font-bold leading-tight text-papel">
        <Cloud className="size-5 shrink-0" aria-hidden />
        <span className="flex-1">Ya hay señal · Volver a la app normal</span>
      </a>
    );
  }
  return null;
}

function Franja({ tono, icono, children }: { tono: "aviso" | "alerta" | "neutro"; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-9 items-center gap-2 border-b-2 border-tinta px-3 py-1 text-base font-bold leading-tight",
        tono === "aviso" && "bg-sol text-tinta",
        tono === "alerta" && "bg-aji text-papel",
        tono === "neutro" && "bg-papel text-tinta"
      )}
    >
      {icono}
      {typeof children === "string" || Array.isArray(children) ? <span className="flex-1">{children}</span> : children}
    </div>
  );
}
