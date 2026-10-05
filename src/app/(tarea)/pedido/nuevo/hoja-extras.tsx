"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import type { MenuParaPedido } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { alternarNota, NOTAS_RAPIDAS, type AdicionElegida } from "@/lib/pedido-borrador";
import { cn } from "@/lib/utils";

type Producto = MenuParaPedido["productos"][number];

/**
 * Adiciones y nota de UN plato: "queso extra", "sin cebolla". Toque en el plato → "Extras y nota" → elegir → Agregar:
 * 3 toques como máximo. El precio que muestra el botón es informativo; el servidor lo recalcula al enviar.
 */
export function HojaExtras({
  producto,
  adiciones,
  onAgregar,
  onCerrar,
}: {
  producto: Producto;
  adiciones: MenuParaPedido["modificadores"];
  onAgregar: (adiciones: AdicionElegida[], notas: string, cantidad: number) => void;
  onCerrar: () => void;
}) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [notas, setNotas] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const seleccion: AdicionElegida[] = adiciones.filter((a) => elegidas.includes(a.id)).map((a) => ({ id: a.id, nombre: a.nombre, precio: a.precio_extra }));
  const unidad = producto.precio + seleccion.reduce((s, a) => s + a.precio, 0);

  return (
    <HojaInferior titulo={producto.nombre} onCerrar={onCerrar}>
      {adiciones.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-tinta-2">Adiciones</legend>
          <div className="grid grid-cols-1 gap-2">
            {adiciones.map((a) => {
              const activa = elegidas.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  role="checkbox"
                  aria-checked={activa}
                  onClick={() => setElegidas((e) => (activa ? e.filter((x) => x !== a.id) : [...e, a.id]))}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl border-2 border-tinta px-3 text-left text-base font-bold transition-[transform,box-shadow] duration-75 active:translate-y-[2px]",
                    activa ? "bg-sol shadow-sello-chico" : "bg-papel"
                  )}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-tinta", activa ? "bg-tinta text-papel" : "bg-papel")}>
                    {activa && <Check className="size-4" strokeWidth={4} aria-hidden />}
                  </span>
                  <span className="flex-1">{a.nombre}</span>
                  <span className="cifra text-xl">{a.precio_extra > 0 ? `+ ${formatearPesos(a.precio_extra)}` : "Gratis"}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className={adiciones.length > 0 ? "mt-4" : ""}>
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-tinta-2">Nota para la cocina</p>
        <div className="flex flex-wrap gap-2">
          {NOTAS_RAPIDAS.map((n) => {
            const activa = notas.toLowerCase().split(",").map((p) => p.trim()).includes(n.toLowerCase());
            return (
              <button
                key={n}
                type="button"
                aria-pressed={activa}
                onClick={() => setNotas((t) => alternarNota(t, n))}
                className={cn("min-h-12 rounded-xl border-2 border-tinta px-3 text-base font-bold active:translate-y-[2px]", activa ? "bg-sol" : "bg-papel")}
              >
                {n}
              </button>
            );
          })}
        </div>
        <Label htmlFor="nota-plato" className="sr-only">
          Nota
        </Label>
        <Input id="nota-plato" className="mt-2" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={120} placeholder="Otra nota (opcional)" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-base font-bold">Cantidad</span>
        <Stepper valor={cantidad} onCambio={setCantidad} etiqueta="cantidad" />
      </div>

      <Button tamano="lg" bloque className="mt-4" onClick={() => onAgregar(seleccion, notas, cantidad)}>
        Agregar · {formatearPesos(unidad * cantidad)}
      </Button>
    </HojaInferior>
  );
}
