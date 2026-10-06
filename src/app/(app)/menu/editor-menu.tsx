"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { cambiarDisponibilidad } from "@/app/acciones/menu";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Interruptor } from "@/components/ui/interruptor";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { HojaCategoria } from "./hoja-categoria";
import { HojaPlato } from "./hoja-plato";

type Categoria = MenuAdmin["categorias"][number];
type Plato = Categoria["productos"][number];
type Hoja = { tipo: "plato"; plato: Plato | null; categoriaId: string } | { tipo: "categoria"; categoria: Categoria | null } | null;

/** Menú: platos por categoría con precio y el interruptor "Hay / Agotado". Crear y editar es solo del dueño. */
export function EditorMenu({ menu, esDueno }: { menu: MenuAdmin; esDueno: boolean }) {
  const [hoja, setHoja] = useState<Hoja>(null);
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();

  const [categorias, aplicar] = useOptimistic(menu.categorias, (estado, cambio: { id: string; disponible: boolean }) =>
    estado.map((c) => ({ ...c, productos: c.productos.map((p) => (p.id === cambio.id ? { ...p, disponible: cambio.disponible } : p)) }))
  );

  function alternar(id: string, disponible: boolean) {
    setError(null);
    empezar(async () => {
      aplicar({ id, disponible });
      const r = await cambiarDisponibilidad(id, disponible);
      if (!r.ok) setError(r.error);
    });
  }

  const totalPlatos = categorias.reduce((s, c) => s + c.productos.length, 0);

  return (
    <>
      <div className="space-y-5 px-4 pt-3">
        <p className="text-base text-tinta-2">
          {totalPlatos} platos. Toca un plato para cambiar su nombre o precio; el interruptor dice si hay hoy.
        </p>
        {error && (
          <Aviso tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Aviso>
        )}

        {categorias.map((c) => (
          <section key={c.id} aria-label={c.nombre}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-display flex items-center gap-2 text-2xl font-extrabold uppercase leading-none tracking-tight">
                <span aria-hidden>{c.icono}</span>
                {c.nombre}
                {!c.activa && <Badge>Oculta</Badge>}
              </h2>
              {esDueno && (
                <Button variante="fantasma" tamano="icono" aria-label={`Editar la categoría ${c.nombre}`} onClick={() => setHoja({ tipo: "categoria", categoria: c })}>
                  <Pencil className="size-5" aria-hidden />
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {c.productos.map((p) => (
                <li key={p.id} className="flex items-stretch gap-1.5 rounded-xl border-2 border-tinta bg-papel pr-1">
                  <button
                    type="button"
                    disabled={!esDueno}
                    onClick={() => setHoja({ tipo: "plato", plato: p, categoriaId: c.id })}
                    className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 rounded-l-xl px-3 text-left active:bg-tinta/10 disabled:active:bg-transparent"
                  >
                    <span className={`text-base font-bold leading-tight ${p.disponible ? "" : "text-tinta-2 line-through"}`}>{p.nombre}</span>
                    <span className="cifra shrink-0 text-2xl">{formatearPesos(p.precio)}</span>
                  </button>
                  <Interruptor activo={p.disponible} onCambio={(v) => alternar(p.id, v)} etiqueta={`${p.nombre}: hay hoy`} textoActivo="Hay" textoInactivo="Agotado" className="self-center" />
                </li>
              ))}
              {c.productos.length === 0 && <li className="text-base text-tinta-2">Todavía no hay platos en esta categoría.</li>}
            </ul>
            {esDueno && (
              <Button variante="secundario" className="mt-2" onClick={() => setHoja({ tipo: "plato", plato: null, categoriaId: c.id })}>
                <Plus className="size-5" aria-hidden /> Plato en {c.nombre}
              </Button>
            )}
          </section>
        ))}
      </div>

      {esDueno && (
        <BarraAccion sobreNav>
          <Button tamano="lg" bloque onClick={() => setHoja({ tipo: "categoria", categoria: null })}>
            <Plus className="size-6" strokeWidth={3} aria-hidden /> Categoría nueva
          </Button>
        </BarraAccion>
      )}

      {hoja?.tipo === "plato" && (
        <HojaPlato
          key={hoja.plato?.id ?? "nuevo"}
          plato={hoja.plato}
          categoriaInicial={hoja.categoriaId}
          categorias={menu.categorias.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono }))}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja?.tipo === "categoria" && <HojaCategoria key={hoja.categoria?.id ?? "nueva"} categoria={hoja.categoria} onCerrar={() => setHoja(null)} />}
    </>
  );
}
