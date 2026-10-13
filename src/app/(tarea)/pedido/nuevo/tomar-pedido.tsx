"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDown, ChevronLeft, SlidersHorizontal } from "lucide-react";
import { ChipGuia } from "@/components/guia/chip-guia";
import { BandaSync } from "@/components/sync/banda-sync";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { almacenBorrador } from "@/lib/borrador-local";
import type { MenuParaPedido } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { Enlace, useIr } from "@/lib/navegacion";
import { enviarPedido } from "@/lib/sync/acciones";
import { numeroVisible } from "@/lib/sync/numero";
import {
  aItemsDeEnvio, cantidadDe, DESTINO_INICIAL, etiquetaDestino, faltaEnDestino, leerDestino, reconciliarConMenu, totalBorrador, totalUnidades,
  type AdicionElegida, type Destino,
} from "@/lib/pedido-borrador";
import { cn } from "@/lib/utils";
import { HojaCarrito } from "./hoja-carrito";
import { HojaDestino } from "./hoja-destino";
import { HojaExtras } from "./hoja-extras";

type Producto = MenuParaPedido["productos"][number];

/** Cuando se llega desde "Agregar platos" de un pedido que ya existe. */
export type ModoAgregar = { pedidoId: string; numero: number; tipo: Destino["tipo"]; etiqueta: string };

/** Un pedido a medio tomar se conserva este tiempo desde el último toque; después se descarta solo. */
const VIGENCIA_BORRADOR_MS = 30 * 60_000;
const sinSuscripcion = () => () => {};

export function TomarPedido({ menu, agregar }: { menu: MenuParaPedido; agregar: ModoAgregar | null }) {
  const router = useIr();
  // El pedido a medio tomar vive fuera de la pantalla (lib/borrador-local.ts): si una alerta, una notificación o la
  // flecha de volver sacan de aquí, al regresar sigue como estaba. Cada pedido al que se le agregan platos lleva el suyo.
  const almacen = almacenBorrador<Destino>({
    clave: agregar ? `pedido:agregar:${agregar.pedidoId}` : "pedido:nuevo",
    extraInicial: DESTINO_INICIAL,
    vigenciaMs: VIGENCIA_BORRADOR_MS,
    leerExtra: leerDestino,
  });
  const guardado = useSyncExternalStore(almacen.suscribir, almacen.leer, () => almacen.vacio);
  const { borrador } = guardado;
  const despachar = almacen.despachar;
  const destino: Destino = agregar ? { ...DESTINO_INICIAL, tipo: agregar.tipo, agregarA: agregar.pedidoId } : guardado.extra;
  const listo = useSyncExternalStore(sinSuscripcion, () => true, () => false); // ya en el celular (no en el HTML del servidor)
  const [categoriaId, setCategoriaId] = useState(menu.categorias[0]?.id ?? "");
  // Lo primero que hay que decidir es para quién es: mientras nadie la toque ("auto"), la hoja se abre sola si eso
  // falta. Al retomar un pedido que ya tenía destino no estorba; al agregar platos a un pedido tampoco.
  const [hojaDestino, setHojaDestino] = useState<"auto" | boolean>("auto");
  const destinoAbierta = hojaDestino === "auto" ? listo && !agregar && faltaEnDestino(destino) !== null : hojaDestino;
  const [hojaCarrito, setHojaCarrito] = useState(false);
  const [extras, setExtras] = useState<Producto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  const categoria = menu.categorias.find((c) => c.id === categoriaId) ?? menu.categorias[0];
  const productos = menu.productos.filter((p) => p.categoria_id === categoria?.id);
  const nombreMesa = menu.mesas.find((m) => m.id === destino.mesaId)?.nombre ?? null;
  const etiqueta = agregar ? agregar.etiqueta : etiquetaDestino(destino, nombreMesa);
  const unidades = totalUnidades(borrador);
  const total = totalBorrador(borrador);

  // Un pedido retomado se pone al día con el menú de ahora: fuera lo agotado, precios vigentes.
  useEffect(() => {
    const actual = almacen.leer().borrador;
    const alDia = reconciliarConMenu(actual, menu);
    if (alDia !== actual) almacen.despachar({ tipo: "restaurar", borrador: alDia });
  }, [almacen, menu]);

  function enviar() {
    if (!agregar) {
      const falta = faltaEnDestino(destino);
      if (falta) {
        setHojaCarrito(false);
        setHojaDestino(true);
        return;
      }
    }
    setError(null);
    empezar(async () => {
      const r = await enviarPedido({
        tipo: destino.tipo,
        mesaId: destino.mesaId,
        agregarA: destino.agregarA,
        contactoNombre: destino.contactoNombre,
        contactoTelefono: destino.contactoTelefono,
        direccion: destino.direccion,
        items: aItemsDeEnvio(borrador),
      });
      if (!r.ok) {
        setError(r.error);
        setHojaCarrito(true);
        return;
      }
      setHojaDestino(false); // el pedido ya salió: que la hoja de destino no se asome mientras se cambia de pantalla
      almacen.olvidar();
      router.push(`/pedidos?enviado=${r.datos.numero}${r.datos.agregado ? "&agregado=1" : ""}${r.datos.pendiente ? "&pendiente=1" : ""}`);
    });
  }

  if (menu.categorias.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-start justify-center gap-4 px-4">
        <h1 className="font-display text-4xl font-extrabold uppercase leading-none">El menú está vacío</h1>
        <p className="text-lg text-tinta-2">Primero agrega categorías y platos para poder tomar pedidos.</p>
        <Enlace href="/menu" className="inline-flex min-h-14 items-center rounded-xl border-2 border-tinta bg-sol px-5 text-lg font-bold shadow-sello">
          Ir al menú
        </Enlace>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0">
        <BandaSync />
      </div>
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b-2 border-tinta bg-fondo px-2 pt-[env(safe-area-inset-top,0px)]">
        <Enlace href={agregar ? "/pedidos" : "/inicio"} aria-label="Volver" className="tap flex items-center justify-center rounded-full active:bg-tinta/10">
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
        </Enlace>
        <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">{agregar ? `Agregar ${numeroVisible(agregar.numero)}` : "Pedido"}</h1>
        {!agregar && (
          <button
            type="button"
            onClick={() => setHojaDestino(true)}
            className={cn(
              "ml-auto flex min-h-12 max-w-[55%] items-center gap-1 rounded-xl border-2 border-tinta px-3 text-base font-bold shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none",
              faltaEnDestino(destino) ? "bg-sol" : "bg-papel"
            )}
          >
            <span className="truncate">{etiqueta}</span>
            <ChevronDown className="size-5 shrink-0" aria-hidden />
          </button>
        )}
        <span className={agregar ? "ml-auto" : undefined}>
          <ChipGuia />
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Categorías: solo emoji (aria-label con el nombre); el nombre se ve sobre los platos. */}
        <nav aria-label="Categorías" className="w-[68px] shrink-0 overflow-y-auto overscroll-contain border-r-2 border-tinta bg-papel pb-accion">
          {menu.categorias.map((c) => {
            const activa = c.id === categoria?.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.nombre}
                aria-current={activa ? "true" : undefined}
                onClick={() => setCategoriaId(c.id)}
                className={cn(
                  "flex min-h-16 w-full items-center justify-center border-b-2 border-tinta/20 text-[1.9rem] leading-none active:bg-tinta/10",
                  activa && "border-b-tinta bg-sol"
                )}
              >
                <span aria-hidden>{c.icono ?? "🍽"}</span>
              </button>
            );
          })}
        </nav>

        <section aria-label={categoria?.nombre} className="pb-accion min-w-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <h2 className="font-display mb-2 text-2xl font-extrabold uppercase leading-none tracking-tight">{categoria?.nombre}</h2>
          <div className="grid grid-cols-2 gap-2">
            {productos.map((p) => {
              const cant = cantidadDe(borrador, p.id);
              return (
                <div
                  key={p.id}
                  data-guia="plato"
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-xl border-2 border-tinta shadow-sello-chico",
                    cant > 0 ? "bg-sol-suave" : "bg-papel",
                    !p.disponible && "opacity-50"
                  )}
                >
                  <button
                    type="button"
                    disabled={!p.disponible}
                    onClick={() => despachar({ tipo: "agregar", producto: p })}
                    className="flex min-h-20 flex-1 flex-col items-start justify-between gap-1 p-2 text-left active:bg-sol disabled:active:bg-transparent"
                  >
                    <span className="text-base font-bold leading-tight">{p.nombre}</span>
                    <span className="cifra text-2xl">{p.disponible ? formatearPesos(p.precio) : "Agotado"}</span>
                  </button>
                  {p.disponible && (
                    <button
                      type="button"
                      onClick={() => setExtras(p)}
                      className="flex min-h-12 items-center justify-center gap-1.5 border-t-2 border-dashed border-tinta/40 text-sm font-bold active:bg-tinta/10"
                    >
                      <SlidersHorizontal className="size-4" aria-hidden /> Extras y nota
                    </button>
                  )}
                  {cant > 0 && (
                    <span
                      aria-label={`${cant} en el pedido`}
                      className="cifra pointer-events-none absolute top-1.5 right-1.5 flex min-w-7 items-center justify-center rounded-full border-2 border-tinta bg-tinta px-1.5 py-0.5 text-lg text-papel"
                    >
                      {cant}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <BarraAccion className="flex gap-2">
        <button
          type="button"
          onClick={() => setHojaCarrito(true)}
          disabled={unidades === 0}
          aria-label={`Ver el pedido: ${unidades} platos, ${formatearPesos(total)}`}
          className="flex min-h-14 w-[8.75rem] shrink-0 flex-col items-start justify-center rounded-xl border-2 border-tinta bg-papel px-3 leading-none shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
        >
          <span className="cifra text-2xl">{formatearPesos(total)}</span>
          <span className="mt-0.5 text-xs font-bold text-tinta-2">{unidades === 1 ? "1 plato" : `${unidades} platos`} · ver</span>
        </button>
        <Button tamano="lg" className="flex-1" disabled={unidades === 0 || enviando} onClick={enviar}>
          {enviando ? "Enviando…" : "Enviar a cocina"}
        </Button>
      </BarraAccion>

      {destinoAbierta && (
        <HojaDestino
          mesas={menu.mesas}
          destino={destino}
          onElegir={(d) => {
            almacen.ponerExtra(d);
            setHojaDestino(false);
          }}
          onCerrar={() => setHojaDestino(false)}
        />
      )}
      {extras && (
        <HojaExtras
          producto={extras}
          adiciones={menu.modificadores.filter((m) => m.categoria_id === null || m.categoria_id === extras.categoria_id)}
          onAgregar={(adiciones: AdicionElegida[], notas: string, cantidad: number) => {
            despachar({ tipo: "agregar", producto: extras, adiciones, notas, cantidad });
            setExtras(null);
          }}
          onCerrar={() => setExtras(null)}
        />
      )}
      {hojaCarrito && (
        <HojaCarrito
          borrador={borrador}
          despachar={despachar}
          etiqueta={etiqueta}
          onEnviar={enviar}
          enviando={enviando}
          error={error}
          onCerrar={() => setHojaCarrito(false)}
        />
      )}
    </div>
  );
}
