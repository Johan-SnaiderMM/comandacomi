"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { reiniciarDemo } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";

/**
 * Reiniciar demo: borra lo creado en la demo (pedidos, gastos, cuentas, cambios al menú) y vuelve a cargar los datos
 * de ejemplo. Pide confirmación porque no se puede deshacer. La base solo lo permite en restaurantes de demostración.
 */
export function BotonReiniciar({ className }: { className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function reiniciar() {
    setError(null);
    empezar(async () => {
      const r = await reiniciarDemo(); // si sale bien, el servidor redirige a Inicio
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <RotateCcw className="size-6 shrink-0" aria-hidden />
        <span className="flex-1 text-left leading-tight">
          Reiniciar demo
          <span className="block text-sm font-normal text-tinta-2">Borra lo creado y recarga los datos de ejemplo</span>
        </span>
      </button>

      {abierta && (
        <HojaInferior titulo="¿Reiniciar la demo?" onCerrar={() => setAbierta(false)}>
          <p className="text-base">Se borra todo lo que creaste (pedidos, gastos, cobros, fiado y cambios al menú) y vuelven los datos de ejemplo de los últimos 7 días.</p>
          <p className="mt-2 text-base font-bold">Esto no se puede deshacer.</p>
          {error && (
            <p role="alert" className="mt-2 text-base font-bold text-aji">
              {error}
            </p>
          )}
          <Button variante="peligro" tamano="lg" bloque className="mt-4" disabled={pendiente} onClick={reiniciar}>
            {pendiente ? "Reiniciando…" : "Sí, reiniciar la demo"}
          </Button>
          <Button variante="fantasma" bloque className="mt-1" disabled={pendiente} onClick={() => setAbierta(false)}>
            Cancelar
          </Button>
        </HojaInferior>
      )}
    </>
  );
}
