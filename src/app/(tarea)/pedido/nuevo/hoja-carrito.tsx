"use client";

import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Stepper } from "@/components/ui/stepper";
import { formatearPesos } from "@/lib/dinero";
import { subtotalDe, totalBorrador, type Accion, type Borrador } from "@/lib/pedido-borrador";

/** El pedido como un tiquete: cada línea con su cantidad (− / +), adiciones y nota. */
export function HojaCarrito({
  borrador,
  despachar,
  etiqueta,
  onEnviar,
  enviando,
  error,
  onCerrar,
}: {
  borrador: Borrador;
  despachar: (a: Accion) => void;
  etiqueta: string;
  onEnviar: () => void;
  enviando: boolean;
  error: string | null;
  onCerrar: () => void;
}) {
  return (
    <HojaInferior titulo="Tu pedido" onCerrar={onCerrar}>
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-tinta-2">{etiqueta}</p>

      {borrador.lineas.length === 0 ? (
        <p className="py-6 text-center text-lg text-tinta-2">Todavía no hay platos. Toca un plato para agregarlo.</p>
      ) : (
        <ul className="divide-y-2 divide-dashed divide-tinta/30">
          {borrador.lineas.map((l) => (
            <li key={l.clave} className="flex items-center gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{l.nombre}</p>
                {l.adiciones.length > 0 && <p className="text-sm text-tinta-2">+ {l.adiciones.map((a) => a.nombre).join(", ")}</p>}
                {l.notas && <p className="text-sm font-bold">“{l.notas}”</p>}
                <p className="cifra mt-1 text-xl">{formatearPesos(subtotalDe(l))}</p>
              </div>
              <Stepper
                valor={l.cantidad}
                minimo={0}
                etiqueta={l.nombre}
                onCambio={(n) => despachar({ tipo: "cambiar", clave: l.clave, delta: n - l.cantidad })}
              />
            </li>
          ))}
        </ul>
      )}

      <hr className="separador-punteado my-3" />
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold">Total</span>
        <span className="cifra text-4xl">{formatearPesos(totalBorrador(borrador))}</span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-aji">
          {error}
        </p>
      )}
      <Button tamano="lg" bloque className="mt-4" disabled={borrador.lineas.length === 0 || enviando} onClick={onEnviar}>
        {enviando ? "Enviando…" : "Enviar a cocina"}
      </Button>
      {borrador.lineas.length > 0 && (
        <Button variante="fantasma" bloque className="mt-1" onClick={() => despachar({ tipo: "vaciar" })}>
          Vaciar pedido
        </Button>
      )}
    </HojaInferior>
  );
}
