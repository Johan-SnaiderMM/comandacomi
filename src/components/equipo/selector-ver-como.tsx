"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Eye } from "lucide-react";
import { verComo } from "@/app/acciones/equipo";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { TEXTO_AREA, type Area } from "@/lib/areas";
import { MENSAJE_GENERICO } from "@/lib/errores";

type Rol = { id: string; nombre: string; areas: Area[] };

/**
 * Más → "Ver la app como…" (solo el dueño): elige un rol y la app de ESTE celular se ve como la ve ese rol, hasta que
 * toque "Volver a dueño" (la franja de arriba). Sirve para enseñar la demo o para saber qué ve el mesero.
 */
export function SelectorVerComo({ roles, className }: { roles: Rol[]; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function elegir(id: string) {
    setError(null);
    empezar(async () => {
      try {
        const r = await verComo(id); // si sale bien, lleva a la pantalla de ese rol
        if (r && !r.ok) setError(r.error);
      } catch {
        setError(MENSAJE_GENERICO);
      }
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <Eye className="size-6 shrink-0" aria-hidden />
        <span className="flex-1 text-left leading-tight">
          Ver la app como…
          <span className="block text-sm font-normal text-tinta-2">Lo que ve el mesero, la cocina, la caja</span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </button>

      {abierta && (
        <HojaInferior titulo="Ver la app como…" onCerrar={() => setAbierta(false)}>
          <p className="text-base text-tinta-2">Este celular muestra la app como la ve ese rol. Para volver, toca «Volver a dueño» arriba.</p>
          <ul className="mt-3 space-y-2">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => elegir(r.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-tinta bg-papel px-3 py-2 text-left shadow-sello-chico active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-lg font-bold">{r.nombre}</span>
                    <span className="block text-base text-tinta-2">{r.areas.map((a) => TEXTO_AREA[a].titulo).join(" · ")}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-3 text-base font-bold text-aji">
              {error}
            </p>
          )}
        </HojaInferior>
      )}
    </>
  );
}
