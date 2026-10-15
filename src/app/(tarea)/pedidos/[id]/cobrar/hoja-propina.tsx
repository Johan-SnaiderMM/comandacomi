"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { TecladoNumerico } from "@/components/ui/teclado-numerico";
import { formatearPesos, propinaSugerida } from "@/lib/dinero";
import { aplicarTecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";

/** La propina es SIEMPRE opcional: sin propina, la sugerida (10 %) o el valor que el cliente diga. */
export function HojaPropina({
  cuenta,
  propina,
  onElegir,
  onCerrar,
}: {
  cuenta: number;
  propina: number;
  onElegir: (valor: number) => void;
  onCerrar: () => void;
}) {
  const sugerida = propinaSugerida(cuenta);
  const [otra, setOtra] = useState(propina !== 0 && propina !== sugerida);
  const [valor, setValor] = useState(otra ? propina : 0);

  const opcion = "flex min-h-14 flex-col items-center justify-center rounded-xl border-2 border-tinta px-1 text-base font-bold leading-tight shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none";

  return (
    <HojaInferior titulo="Propina" onCerrar={onCerrar}>
      <p className="mb-3 text-base text-tinta-2">Es voluntaria. La cuenta es {formatearPesos(cuenta)}.</p>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={cn(opcion, propina === 0 && !otra ? "bg-sol" : "bg-papel")} onClick={() => onElegir(0)}>
          Sin propina
        </button>
        <button type="button" className={cn(opcion, propina === sugerida && sugerida > 0 && !otra ? "bg-sol" : "bg-papel")} onClick={() => onElegir(sugerida)}>
          10 %<span className="text-base">{formatearPesos(sugerida)}</span>
        </button>
        <button type="button" className={cn(opcion, otra ? "bg-sol" : "bg-papel")} onClick={() => setOtra(true)}>
          Otra
        </button>
      </div>

      {otra && (
        <div className="mt-4">
          <p className="cifra mb-2 text-center text-5xl">{formatearPesos(valor)}</p>
          <TecladoNumerico onTecla={(t) => setValor((v) => Math.min(aplicarTecla(v, t), cuenta))} />
          <Button tamano="lg" bloque className="mt-3" onClick={() => onElegir(valor)}>
            Listo
          </Button>
        </div>
      )}
    </HojaInferior>
  );
}
