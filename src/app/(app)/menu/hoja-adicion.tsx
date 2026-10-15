"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { guardarAdicion } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { HojaMonto } from "@/components/ui/hoja-monto";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Adicion } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { cn } from "@/lib/utils";

/**
 * Crear o editar una adición ("Queso extra + $ 2.000"): nombre, cuánto suma y a qué platos se les puede poner (los de
 * una categoría o cualquiera). Quitar no borra: los pedidos de antes conservan la suya.
 */
export function HojaAdicion({
  adicion,
  categoriaInicial,
  categorias,
  onHecho,
  onCerrar,
}: {
  /** null = adición nueva. */
  adicion: Adicion | null;
  /** null = para cualquier plato. */
  categoriaInicial: string | null;
  categorias: { id: string; nombre: string; icono: string | null }[];
  onHecho: (aviso: string) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(adicion?.nombre ?? "");
  const [precio, setPrecio] = useState(adicion?.precio_extra ?? 0);
  const [categoriaId, setCategoriaId] = useState<string | null>(categoriaInicial);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar(activo: boolean) {
    setError(null);
    empezar(async () => {
      const r = await guardarAdicion({ id: adicion?.id ?? null, categoriaId, nombre, precioExtra: precio, activo });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onHecho(activo ? `Adición «${nombre.trim()}» guardada.` : `«${adicion?.nombre}» ya no se ofrece.`);
    });
  }

  return (
    <HojaInferior titulo={adicion ? "Editar adición" : "Adición nueva"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="adicion-nombre">Nombre</Label>
          <Input id="adicion-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} autoCapitalize="sentences" placeholder="Ej. Queso extra" />
        </div>

        <div>
          <p className="mb-1.5 text-base font-bold">Cuánto suma al plato</p>
          <button
            type="button"
            onClick={() => setEditandoPrecio(true)}
            className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-tinta bg-papel px-3 shadow-sello-chico active:translate-y-[2px] active:shadow-none"
          >
            <span className="cifra text-4xl">{precio === 0 ? "Gratis" : `+ ${formatearPesos(precio)}`}</span>
            <span className="flex items-center gap-1 text-base font-bold text-tinta-2">
              <Pencil className="size-4" aria-hidden /> Cambiar
            </span>
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-base font-bold">Se le puede poner a</p>
          <div className="flex flex-wrap gap-2">
            {[{ id: null as string | null, nombre: "Cualquier plato", icono: "⭐" as string | null }, ...categorias].map((c) => (
              <button
                key={c.id ?? "todas"}
                type="button"
                aria-pressed={categoriaId === c.id}
                onClick={() => setCategoriaId(c.id)}
                className={cn("min-h-12 rounded-xl border-2 border-tinta px-3 text-base font-bold active:translate-y-[2px]", categoriaId === c.id ? "bg-sol" : "bg-papel")}
              >
                {c.icono} {c.nombre}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={() => guardar(true)}>
          {pendiente ? "Guardando…" : "Guardar adición"}
        </Button>
        {adicion && !quitando && (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar la adición
          </Button>
        )}
        {adicion && quitando && (
          <div role="group" aria-label="Confirmar quitar la adición" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar «{adicion.nombre}»?</p>
            <p className="mt-1 text-base text-tinta-2">Deja de ofrecerse al tomar pedidos y en el enlace de tus clientes. Los pedidos de antes la conservan.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variante="peligro" tamano="lg" disabled={pendiente} onClick={() => guardar(false)}>
                {pendiente ? "Quitando…" : "Sí, quitar"}
              </Button>
              <Button variante="secundario" tamano="lg" disabled={pendiente} onClick={() => setQuitando(false)}>
                No, dejarla
              </Button>
            </div>
          </div>
        )}
      </div>

      {editandoPrecio && (
        <HojaMonto
          titulo="Cuánto suma"
          ayuda={nombre.trim() ? `${nombre.trim()} · deja 0 si no se cobra` : "Deja 0 si no se cobra"}
          inicial={precio}
          onElegir={(v) => {
            setPrecio(v);
            setEditandoPrecio(false);
          }}
          onCerrar={() => setEditandoPrecio(false)}
        />
      )}
    </HojaInferior>
  );
}
