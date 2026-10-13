"use client";

import { useState, useTransition } from "react";
import { guardarCategoria } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Interruptor } from "@/components/ui/interruptor";
import { Label } from "@/components/ui/label";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { ICONOS_CATEGORIA } from "@/lib/iconos-categoria";
import { cn } from "@/lib/utils";

type Categoria = MenuAdmin["categorias"][number];

/** Crear o editar una categoría: nombre, emoji, si se muestra al tomar pedidos y si sus platos pasan por la cocina. */
export function HojaCategoria({
  categoria,
  onGuardada,
  onCerrar,
}: {
  categoria: Categoria | null;
  /** Avisa cuál categoría se guardó: el menú pasa a mostrarla (una recién creada, si no, no se vería). */
  onGuardada?: (id: string) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? "");
  const [icono, setIcono] = useState(categoria?.icono ?? ICONOS_CATEGORIA[0]);
  const [activa, setActiva] = useState(categoria?.activa ?? true);
  const [sePrepara, setSePrepara] = useState(categoria?.se_prepara ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await guardarCategoria({ id: categoria?.id ?? null, nombre, icono, activa, sePrepara });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardada?.(r.datos.id);
      onCerrar();
    });
  }

  return (
    <HojaInferior titulo={categoria ? "Editar categoría" : "Categoría nueva"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="cat-nombre">Nombre</Label>
          <Input id="cat-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} autoCapitalize="sentences" placeholder="Ej. Postres" />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">Ícono</p>
          <div className="grid grid-cols-6 gap-1.5">
            {ICONOS_CATEGORIA.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={icono === e}
                aria-label={`Ícono ${e}`}
                onClick={() => setIcono(e)}
                className={cn("flex min-h-12 items-center justify-center rounded-xl border-2 border-tinta text-2xl active:translate-y-[2px]", icono === e ? "bg-sol" : "bg-papel")}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-tinta px-3 py-1">
          <span className="text-base font-bold">¿Se muestra al tomar pedidos?</span>
          <Interruptor activo={activa} onCambio={setActiva} etiqueta="Mostrar la categoría" textoActivo="Sí" textoInactivo="Oculta" />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-tinta px-3 py-1">
          <span className="text-base font-bold leading-tight">
            ¿Se prepara en la cocina?
            <span className="block text-base font-normal text-tinta-2">
              {sePrepara ? "Sí: sus platos salen en la plancha." : "No (bebidas, empacados): se entregan de una vez y no salen en la plancha."}
            </span>
          </span>
          <Interruptor activo={sePrepara} onCambio={setSePrepara} etiqueta="Se prepara en la cocina" textoActivo="Sí" textoInactivo="No" />
        </div>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={guardar}>
          {pendiente ? "Guardando…" : "Guardar categoría"}
        </Button>
      </div>
    </HojaInferior>
  );
}
