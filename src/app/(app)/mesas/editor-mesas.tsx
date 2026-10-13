"use client";

import { useState, useTransition } from "react";
import { Armchair, Pencil, Plus } from "lucide-react";
import { guardarMesa } from "@/app/acciones/menu";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MesaAdmin } from "@/lib/datos/tipos";
import { siguienteNombreDeMesa } from "@/lib/mesas";

/**
 * Mesas del local. Tocar una la abre para cambiarle el nombre o quitarla; abajo, "Mesa nueva". Quitar no borra: los
 * pedidos de antes conservan su mesa, y si se vuelve a crear con el mismo nombre es la misma.
 */
export function EditorMesas({ mesas, esDueno }: { mesas: MesaAdmin[]; esDueno: boolean }) {
  const [hoja, setHoja] = useState<{ mesa: MesaAdmin | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <>
      <div className="space-y-3 px-4 pt-3">
        <p className="text-base text-tinta-2">
          {mesas.length === 1 ? "1 mesa" : `${mesas.length} mesas`}. {esDueno ? "Toca una para cambiarle el nombre o quitarla." : "Solo el dueño puede cambiarlas."}
        </p>
        {aviso && (
          <Aviso tipo="ok" onCerrar={() => setAviso(null)}>
            {aviso}
          </Aviso>
        )}
        {mesas.length === 0 ? (
          <div className="flex flex-col items-start gap-3 pt-6">
            <Armchair className="size-10" aria-hidden />
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none">Sin mesas</h2>
            <p className="text-lg text-tinta-2">Si solo vendes para llevar o a domicilio, no necesitas ninguna.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {mesas.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={!esDueno}
                  onClick={() => setHoja({ mesa: m })}
                  aria-label={`${m.nombre}${m.ocupada ? ", ocupada" : ""}${esDueno ? ": editar" : ""}`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-tinta bg-papel px-3 text-left shadow-sello-chico active:translate-y-[2px] active:shadow-none disabled:shadow-none"
                >
                  <Armchair className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-lg font-bold">{m.nombre}</span>
                  {m.ocupada && <Badge variante="sol">Ocupada</Badge>}
                  {esDueno && <Pencil className="size-5 shrink-0 text-tinta-2" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {esDueno && (
        <BarraAccion sobreNav>
          <Button tamano="lg" bloque onClick={() => setHoja({ mesa: null })}>
            <Plus className="size-6" strokeWidth={3} aria-hidden /> Mesa nueva
          </Button>
        </BarraAccion>
      )}

      {hoja && (
        <HojaMesa
          key={hoja.mesa?.id ?? "nueva"}
          mesa={hoja.mesa}
          sugerido={siguienteNombreDeMesa(mesas.map((m) => m.nombre))}
          onHecho={(texto) => {
            setAviso(texto);
            setHoja(null);
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
    </>
  );
}

function HojaMesa({
  mesa,
  sugerido,
  onHecho,
  onCerrar,
}: {
  /** null = mesa nueva. */
  mesa: MesaAdmin | null;
  sugerido: string;
  onHecho: (aviso: string) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(mesa?.nombre ?? sugerido);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar(activa: boolean) {
    setError(null);
    empezar(async () => {
      const r = await guardarMesa({ id: mesa?.id ?? null, nombre, activa });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const limpio = nombre.trim();
      onHecho(!activa ? `«${mesa?.nombre}» ya no sale al tomar pedidos.` : mesa ? `Quedó como «${limpio}».` : r.datos.recuperada ? `«${limpio}» volvió a tus mesas.` : `«${limpio}» ya está en tus mesas.`);
    });
  }

  return (
    <HojaInferior titulo={mesa ? "Editar mesa" : "Mesa nueva"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="mesa-nombre">Nombre</Label>
          <Input id="mesa-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={30} autoCapitalize="sentences" enterKeyHint="done" placeholder="Ej. Mesa 7, Barra, Terraza 2" />
        </div>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={() => guardar(true)}>
          {pendiente ? "Guardando…" : mesa ? "Guardar" : "Agregar mesa"}
        </Button>

        {mesa && mesa.ocupada && <p className="text-base text-tinta-2">Tiene un pedido sin cobrar: cóbralo o anúlalo para poder quitarla.</p>}
        {mesa && !mesa.ocupada && !quitando && (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar la mesa
          </Button>
        )}
        {mesa && quitando && (
          <div role="group" aria-label="Confirmar quitar la mesa" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar «{mesa.nombre}»?</p>
            <p className="mt-1 text-base text-tinta-2">Deja de salir al tomar pedidos. Los pedidos de antes la conservan, y la puedes volver a crear con el mismo nombre.</p>
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
    </HojaInferior>
  );
}
