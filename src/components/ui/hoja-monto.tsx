"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { TecladoNumerico } from "@/components/ui/teclado-numerico";
import { formatearPesos } from "@/lib/dinero";
import { aplicarTecla } from "@/lib/teclado";

/** Pide UN monto con el teclado numérico propio (base de la caja, efectivo contado…). */
export function HojaMonto({
  titulo,
  ayuda,
  inicial,
  confirmar = "Listo",
  onElegir,
  onCerrar,
}: {
  titulo: string;
  ayuda?: string;
  inicial: number;
  confirmar?: string;
  onElegir: (valor: number) => void;
  onCerrar: () => void;
}) {
  const [valor, setValor] = useState(inicial);
  return (
    <HojaInferior titulo={titulo} onCerrar={onCerrar}>
      {ayuda && <p className="mb-2 text-base text-tinta-2">{ayuda}</p>}
      <p className="cifra mb-2 rounded-xl border-2 border-tinta bg-papel px-3 py-1 text-[3rem]">{formatearPesos(valor)}</p>
      <TecladoNumerico onTecla={(t) => setValor((v) => aplicarTecla(v, t))} />
      <Button tamano="lg" bloque className="mt-3" onClick={() => onElegir(valor)}>
        {confirmar}
      </Button>
    </HojaInferior>
  );
}
