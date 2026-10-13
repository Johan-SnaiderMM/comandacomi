"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ClipboardList, Clock, Store } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { almacenBorrador } from "@/lib/borrador-local";
import { formatearPesos } from "@/lib/dinero";
import { DIAS_SEMANA, textoFranja, type Horario } from "@/lib/horario";
import { cantidadDe, reconciliarConMenu, totalBorrador, totalUnidades, type AdicionElegida } from "@/lib/pedido-borrador";
import type { MenuPublico } from "@/lib/publico/tipos";
import { HojaExtras } from "@/app/(tarea)/pedido/nuevo/hoja-extras";
import { HojaPedidoCliente } from "./hoja-pedido-cliente";

type Producto = MenuPublico["productos"][number];

const HORAS_EN_CURSO = 6;

/**
 * Lo guardado del pedido que el cliente envió desde este celular y todavía no termina (para volver a su seguimiento):
 * el texto tal cual, o null si no hay, está dañado o ya pasaron muchas horas. Es el "snapshot" de la suscripción.
 */
function leerPedidoEnCurso(slug: string): string | null {
  try {
    const crudo = window.localStorage.getItem(`pedido-en-curso:${slug}`);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as { token?: string; numero?: number; at?: number };
    if (!v.token || typeof v.numero !== "number" || typeof v.at !== "number") return null;
    if (Date.now() - v.at > HORAS_EN_CURSO * 3_600_000) return null;
    return crudo;
  } catch {
    return null;
  }
}

function suscribirAlmacenamiento(oyente: () => void): () => void {
  window.addEventListener("storage", oyente);
  return () => window.removeEventListener("storage", oyente);
}

/**
 * Panel del cliente: ve el menú del restaurante, arma su pedido y lo envía (para recoger o a domicilio). No hay
 * cuenta ni contraseña. Sigue el mismo diseño de la app: botones grandes, una mano, precios claros.
 */
export function PedirEnLinea({
  menu,
  horario = null,
  apertura = null,
}: {
  menu: MenuPublico;
  /** Horario de atención ya revisado (null = el restaurante no usa horario). */
  horario?: Horario | null;
  /** Está cerrado POR HORARIO: cuándo vuelve a abrir ("Abre hoy a las 6:00 p. m."; "" si no se sabe). null = no es por horario. */
  apertura?: string | null;
}) {
  const { restaurante } = menu;
  // El pedido que el cliente va armando se guarda en su celular (lib/borrador-local.ts): si recarga, cambia de app para
  // preguntar algo o el celular cierra la pestaña, al volver sigue ahí. Se borra al enviarlo.
  const almacen = almacenBorrador<null>({ clave: `cliente:${restaurante.slug}`, extraInicial: null, vigenciaMs: HORAS_EN_CURSO * 3_600_000 });
  const { borrador } = useSyncExternalStore(almacen.suscribir, almacen.leer, () => almacen.vacio);
  const despachar = almacen.despachar;
  const [extras, setExtras] = useState<Producto | null>(null);
  const [hoja, setHoja] = useState(false);
  const guardado = useSyncExternalStore(suscribirAlmacenamiento, () => leerPedidoEnCurso(restaurante.slug), () => null);
  const enCurso = useMemo(() => (guardado ? (JSON.parse(guardado) as { token: string; numero: number }) : null), [guardado]);

  const unidades = totalUnidades(borrador);
  const total = totalBorrador(borrador);
  const abierto = restaurante.abierto;

  const secciones = useMemo(
    () =>
      menu.categorias
        .map((c) => ({ categoria: c, productos: menu.productos.filter((p) => p.categoria_id === c.id) }))
        .filter((s) => s.productos.length > 0),
    [menu]
  );

  // Un pedido retomado se pone al día con el menú de ahora: fuera lo agotado, precios vigentes.
  useEffect(() => {
    const actual = almacen.leer().borrador;
    const alDia = reconciliarConMenu(actual, menu);
    if (alDia !== actual) almacen.despachar({ tipo: "restaurar", borrador: alDia });
  }, [almacen, menu]);

  /** Quita una unidad de un plato (la última variante que se agregó). */
  function quitarUno(productoId: string) {
    const linea = [...borrador.lineas].reverse().find((l) => l.productoId === productoId);
    if (linea) despachar({ tipo: "cambiar", clave: linea.clave, delta: -1 });
  }

  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <Store className="size-4" aria-hidden /> Pide en línea · pagas al recibir
        </p>
        <h1 className="font-display mt-1 text-5xl font-extrabold uppercase leading-[0.95] tracking-tight">{restaurante.nombre}</h1>
      </header>

      <main className={`space-y-4 px-4 pt-3 ${abierto && unidades > 0 ? "pb-accion" : "pb-8"}`}>
        {restaurante.es_demo && (
          <p className="rounded-xl border-2 border-dashed border-tinta/50 bg-papel px-3 py-2 text-base text-tinta-2">
            <strong className="text-tinta">Demostración:</strong> este restaurante es de prueba. Puedes hacer un pedido de ejemplo; no se prepara
            comida de verdad.
          </p>
        )}

        {enCurso && (
          <Link
            href={`/seguimiento/${enCurso.token}`}
            className="flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-tinta bg-listo-suave px-3 text-base font-bold shadow-sello-chico active:translate-y-[2px]"
          >
            <span className="flex items-center gap-2">
              <ClipboardList className="size-5 shrink-0" aria-hidden /> Tienes el pedido #{enCurso.numero} en curso
            </span>
            <span className="underline">Ver</span>
          </Link>
        )}

        {!abierto &&
          (apertura !== null ? (
            <Aviso tipo="error">
              A esta hora {restaurante.nombre} está cerrado. {apertura} Puedes ver el menú, pero no enviar el pedido.
            </Aviso>
          ) : (
            <Aviso tipo="error">Hoy {restaurante.nombre} no está recibiendo pedidos en línea. Puedes ver el menú, pero no enviar el pedido.</Aviso>
          ))}

        {horario && (
          <details className="rounded-xl border-2 border-tinta bg-papel">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-bold">
              <span className="flex items-center gap-2">
                <Clock className="size-5 shrink-0" aria-hidden /> Horario de atención
              </span>
              <span className="text-tinta-2 underline">Ver</span>
            </summary>
            <dl className="divide-y-2 divide-dashed divide-tinta/25 border-t-2 border-tinta px-3 text-base">
              {/* De lunes a domingo, como se lee un horario en la puerta del local. */}
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <div key={d} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="font-bold">{DIAS_SEMANA[d]}</dt>
                  <dd className={horario[d] ? "" : "text-tinta-2"}>{textoFranja(horario[d])}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        {secciones.length === 0 && <p className="pt-6 text-lg text-tinta-2">El menú todavía no tiene platos.</p>}

        {secciones.length > 1 && (
          <nav aria-label="Categorías" className="flex flex-wrap gap-2">
            {secciones.map(({ categoria }) => (
              <a
                key={categoria.id}
                href={`#cat-${categoria.id}`}
                className="flex min-h-12 items-center gap-1.5 rounded-xl border-2 border-tinta bg-papel px-3 text-base font-bold shadow-sello-chico active:translate-y-[2px]"
              >
                <span aria-hidden>{categoria.icono ?? "🍽"}</span>
                {categoria.nombre}
              </a>
            ))}
          </nav>
        )}

        {secciones.map(({ categoria, productos }) => (
          <section key={categoria.id} id={`cat-${categoria.id}`} aria-label={categoria.nombre} className="scroll-mt-4">
            <h2 className="font-display mb-2 text-3xl font-extrabold uppercase leading-none tracking-tight">
              <span aria-hidden>{categoria.icono ?? "🍽"}</span> {categoria.nombre}
            </h2>
            <ul className="space-y-2">
              {productos.map((p) => {
                const cantidad = cantidadDe(borrador, p.id);
                return (
                  <li key={p.id} className="rounded-xl border-2 border-tinta bg-papel p-3 shadow-sello-chico">
                    {/* Qué es: nombre, qué trae y precio; la foto (si el restaurante la puso) a la derecha. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold leading-tight">{p.nombre}</p>
                        {p.descripcion && <p className="mt-0.5 text-base leading-snug text-tinta-2">{p.descripcion}</p>}
                        <p className="cifra mt-1 text-2xl">{p.disponible ? formatearPesos(p.precio) : "Agotado"}</p>
                      </div>
                      {p.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- foto del plato desde Storage público; ya viene comprimida (~60 KB)
                        <img
                          src={p.foto_url}
                          alt={`Foto de ${p.nombre}`}
                          width={88}
                          height={88}
                          loading="lazy"
                          decoding="async"
                          className={`size-[5.5rem] shrink-0 rounded-lg border-2 border-tinta bg-fondo object-cover ${p.disponible ? "" : "opacity-50 grayscale"}`}
                        />
                      )}
                    </div>
                    {/* Qué hacer: una sola fila, con "Agregar" (o la cantidad) al alcance del pulgar. */}
                    {abierto && p.disponible && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExtras(p)}
                          className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg border-2 border-dashed border-tinta/50 px-2 text-base font-bold active:bg-tinta/10"
                        >
                          Extras y nota
                        </button>
                        {cantidad > 0 ? (
                          <Stepper
                            valor={cantidad}
                            minimo={0}
                            maximo={20}
                            etiqueta={p.nombre}
                            className="shrink-0"
                            onCambio={(n) => (n > cantidad ? despachar({ tipo: "agregar", producto: p }) : quitarUno(p.id))}
                          />
                        ) : (
                          <Button tamano="md" className="shrink-0" onClick={() => despachar({ tipo: "agregar", producto: p })} aria-label={`Agregar ${p.nombre}`}>
                            Agregar
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      {abierto && unidades > 0 && (
        <BarraAccion>
          <Button tamano="lg" bloque className="justify-between gap-3" onClick={() => setHoja(true)}>
            <span>Ver mi pedido · {unidades === 1 ? "1 plato" : `${unidades} platos`}</span>
            <span className="cifra text-2xl">{formatearPesos(total)}</span>
          </Button>
        </BarraAccion>
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

      {hoja && <HojaPedidoCliente slug={restaurante.slug} borrador={borrador} despachar={despachar} onCerrar={() => setHoja(false)} />}
    </>
  );
}
