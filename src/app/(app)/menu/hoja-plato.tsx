"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { guardarProducto } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { HojaMonto } from "@/components/ui/hoja-monto";
import { Input } from "@/components/ui/input";
import { Interruptor } from "@/components/ui/interruptor";
import { Label } from "@/components/ui/label";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { cn } from "@/lib/utils";

type Plato = MenuAdmin["categorias"][number]["productos"][number];

/** Crear o editar un plato: nombre, precio (con el teclado numérico), categoría y si hay hoy. */
export function HojaPlato({
  plato,
  categoriaInicial,
  categorias,
  onCerrar,
}: {
  /** null = plato nuevo. */
  plato: Plato | null;
  categoriaInicial: string;
  categorias: { id: string; nombre: string; icono: string | null }[];
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(plato?.nombre ?? "");
  const [precio, setPrecio] = useState(plato?.precio ?? 0);
  const [categoriaId, setCategoriaId] = useState(categoriaInicial);
  const [disponible, setDisponible] = useState(plato?.disponible ?? true);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar(activo: boolean) {
    setError(null);
    empezar(async () => {
      const r = await guardarProducto({ id: plato?.id ?? null, categoriaId, nombre, precio, disponible, activo });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
    });
  }

  return (
    <HojaInferior titulo={plato ? "Editar plato" : "Plato nuevo"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="plato-nombre">Nombre</Label>
          <Input id="plato-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoCapitalize="sentences" placeholder="Ej. Hamburguesa doble" />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">Precio</p>
          <button
            type="button"
            onClick={() => setEditandoPrecio(true)}
            className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-tinta bg-papel px-3 shadow-sello-chico active:translate-y-[2px] active:shadow-none"
          >
            <span className="cifra text-4xl">{formatearPesos(precio)}</span>
            <span className="flex items-center gap-1 text-sm font-bold text-tinta-2">
              <Pencil className="size-4" aria-hidden /> Cambiar
            </span>
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">Categoría</p>
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <button
                key={c.id}
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

        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-tinta px-3 py-1">
          <span className="text-base font-bold">¿Hay hoy?</span>
          <Interruptor activo={disponible} onCambio={setDisponible} etiqueta="Disponible hoy" textoActivo="Hay" textoInactivo="Agotado" />
        </div>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={() => guardar(true)}>
          {pendiente ? "Guardando…" : "Guardar plato"}
        </Button>
        {plato && !quitando && (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar del menú
          </Button>
        )}
        {/* Quitar pide confirmación: antes bastaba un toque (y el botón queda justo debajo de "Guardar"). */}
        {plato && quitando && (
          <div role="group" aria-label="Confirmar quitar del menú" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar «{plato.nombre}» del menú?</p>
            <p className="mt-1 text-base text-tinta-2">
              Deja de salir al tomar pedidos y en el enlace de tus clientes. No se borra: lo puedes volver a poner desde «Platos
              quitados», al final del menú.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variante="peligro" tamano="lg" disabled={pendiente} onClick={() => guardar(false)}>
                {pendiente ? "Quitando…" : "Sí, quitar"}
              </Button>
              <Button variante="secundario" tamano="lg" disabled={pendiente} onClick={() => setQuitando(false)}>
                No, dejarlo
              </Button>
            </div>
          </div>
        )}
      </div>

      {editandoPrecio && (
        <HojaMonto
          titulo="Precio"
          ayuda={nombre.trim() ? nombre.trim() : undefined}
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
