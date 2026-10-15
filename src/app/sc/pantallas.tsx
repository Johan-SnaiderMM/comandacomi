"use client";

/**
 * Pantallas propias de la app sin conexión (/sc): el inicio con lo que se puede hacer, "Más", la lista de lo que falta
 * por subir, el aviso de lo que necesita señal y la confirmación del gasto guardado. Las demás pantallas (pedidos,
 * cobrar, fiado…) son los mismos componentes de la app normal, alimentados con la copia local.
 */
import { ClipboardList, CloudOff, Plus, RefreshCw, ReceiptText, Trash2, UtensilsCrossed, Wallet, NotebookPen, Undo2, TriangleAlert } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { puedeVer, type Quien } from "@/lib/areas";
import { formatearPesos } from "@/lib/dinero";
import { Enlace } from "@/lib/navegacion";
import { obtenerMotor, useEnLinea, useEstadoSync } from "@/lib/sync/cliente";
import { describirOperacion } from "@/lib/sync/describir";
import type { Snapshot } from "@/lib/sync/tipos";
import { cn } from "@/lib/utils";

const fila =
  "flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-tinta bg-papel px-4 py-2 text-lg font-bold shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none";

export function SinDatos() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-4 px-4">
      <CloudOff className="size-10" aria-hidden />
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none">Todavía no hay datos guardados</h1>
      <p className="text-lg text-tinta-2">Para trabajar sin señal, abre la app con conexión una vez: así se guardan el menú, los pedidos y los clientes en este celular.</p>
      <a href="/inicio" className={botonVariantes({ tamano: "lg" })}>
        Intentar de nuevo
      </a>
    </main>
  );
}

export function Cargando() {
  return (
    <main className="px-4 pt-6">
      <p className="text-lg text-tinta-2">Cargando…</p>
    </main>
  );
}

/** El inicio sin conexión: lo que sí se puede hacer (según lo que abre quien usa el celular), y lo que espera a la señal. */
export function InicioSC({ vista, quien }: { vista: Snapshot; quien: Quien }) {
  const enLinea = useEnLinea();
  const pendientes = vista.pendientes.filter((p) => !(p.estado === "entregado" && p.cobrado)).length;
  const porCobrar = vista.pendientes.filter((p) => !p.cobrado).length;
  const deben = vista.clientes.filter((c) => c.saldo > 0).reduce((s, c) => s + c.saldo, 0);
  const verPendientes = puedeVer(quien, "pendientes");
  const verFiado = puedeVer(quien, "fiado");

  return (
    <>
      <EncabezadoPantalla titulo={vista.contexto.restaurante?.nombre ?? "Inicio"} />
      <main className="pb-nav space-y-3 px-4 pt-3">
        <p className="text-base text-tinta-2">
          {enLinea ? "Estás usando la copia guardada en este celular." : "Sin señal: trabajas con lo guardado y todo se sube solo cuando vuelva."}
        </p>

        {puedeVer(quien, "tomar") && (
          <Enlace href="/pedido/nuevo" className={cn(botonVariantes({ tamano: "lg", bloque: true }))}>
            <Plus className="size-6" strokeWidth={3} aria-hidden /> Tomar un pedido
          </Enlace>
        )}

        {(verPendientes || verFiado) && (
          <div className={cn("grid gap-3", verPendientes && verFiado && "grid-cols-2")}>
            {verPendientes && (
              <Enlace href="/pedidos" className={cn(fila, "flex-col items-start gap-0 bg-sol")}>
                <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide">
                  <ClipboardList className="size-4" aria-hidden /> Pendientes
                </span>
                <span className="cifra text-[2rem]">{pendientes}</span>
                <span className="text-base font-normal">{porCobrar === 0 ? "Todos cobrados" : `${porCobrar} por cobrar`}</span>
              </Enlace>
            )}
            {verFiado && (
              <Enlace href="/fiado" className={cn(fila, "flex-col items-start gap-0")}>
                <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-tinta-2">
                  <NotebookPen className="size-4" aria-hidden /> Por cobrar
                </span>
                <span className={cn("cifra text-[2rem]", deben > 0 && "text-aji")}>{formatearPesos(deben)}</span>
                <span className="text-base font-normal text-tinta-2">fiado</span>
              </Enlace>
            )}
          </div>
        )}

        {puedeVer(quien, "gastos") && (
          <Enlace href="/gastos/nuevo" className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
            <Wallet className="size-5" aria-hidden /> Anotar un gasto
          </Enlace>
        )}

        <section aria-label="Lo que necesita conexión" className="rounded-2xl border-2 border-dashed border-tinta/40 p-3">
          <p className="text-base font-bold">Esto espera a tener señal</p>
          <p className="mt-1 text-base text-tinta-2">
            {quien.esDueno ? "Cierre del día, gastos anteriores, menú y fichas de clientes." : "La plancha, los pedidos en línea y todo lo que muestra datos del servidor."}
          </p>
        </section>
      </main>
    </>
  );
}

/** "Más" sin conexión: gasto, sincronización y volver a la app normal. */
export function MasSC({ vista, quien }: { vista: Snapshot; quien: Quien }) {
  const { ops } = useEstadoSync();
  const porSubir = ops.filter((o) => o.estado === "pendiente").length;
  const problemas = ops.filter((o) => o.estado === "fallida").length;
  return (
    <>
      <EncabezadoPantalla titulo="Más" />
      <main className="pb-nav space-y-3 px-4 pt-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">
          {vista.contexto.restaurante?.nombre} · {vista.contexto.perfil?.nombre}
        </p>
        {puedeVer(quien, "gastos") && (
          <Enlace href="/gastos/nuevo" className={fila}>
            <Wallet className="size-6 shrink-0" aria-hidden />
            <span className="flex-1 leading-tight">
              Anotar un gasto
              <span className="block text-base font-normal text-tinta-2">Se guarda y se sube con la señal</span>
            </span>
          </Enlace>
        )}
        <Enlace href="/sincronizacion" className={fila}>
          <RefreshCw className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 leading-tight">
            Sincronización
            <span className="block text-base font-normal text-tinta-2">
              {porSubir === 0 && problemas === 0 ? "Todo al día" : `${porSubir} por subir${problemas > 0 ? ` · ${problemas} con problema` : ""}`}
            </span>
          </span>
        </Enlace>
        <a href="/mas" className={cn(fila, "text-tinta-2")}>
          <UtensilsCrossed className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 leading-tight">
            Cierre, menú y más
            <span className="block text-base font-normal">Necesitan señal: abrir la app normal</span>
          </span>
        </a>
      </main>
    </>
  );
}

/** Lo que falta por subir y lo que el servidor rechazó, para revisarlo. */
export function Sincronizacion({ vista }: { vista: Snapshot | null }) {
  const { ops, sincronizando, sinRed } = useEstadoSync();
  const enLinea = useEnLinea();
  const motor = obtenerMotor();
  const pendientes = ops.filter((o) => o.estado === "pendiente");
  const problemas = ops.filter((o) => o.estado === "fallida");

  return (
    <>
      <EncabezadoPantalla titulo="Sincronización" atras="/mas" />
      <main className="pb-nav space-y-3 px-4 pt-3">
        <p className="text-base text-tinta-2">
          {!enLinea || sinRed ? "Sin señal: lo de abajo se sube solo cuando vuelva." : sincronizando ? "Subiendo…" : pendientes.length === 0 && problemas.length === 0 ? "Todo está al día." : "Hay cambios por subir."}
        </p>

        {enLinea && pendientes.length > 0 && (
          <Button tamano="lg" bloque disabled={sincronizando} onClick={() => void motor?.vaciar()}>
            <RefreshCw className="size-5" aria-hidden /> {sincronizando ? "Subiendo…" : "Subir ahora"}
          </Button>
        )}

        {problemas.length > 0 && (
          <section aria-label="Cambios con problema" className="space-y-2">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none">Con problema</h2>
            <Aviso tipo="error">El servidor no pudo aplicar estos cambios. Revisa el motivo: puedes reintentar o descartarlos.</Aviso>
            <ul className="space-y-2">
              {problemas.map((o) => (
                <li key={o.clave} className="rounded-xl border-2 border-aji bg-aji-suave p-3">
                  <p className="flex items-start gap-2 text-lg font-bold leading-tight">
                    <TriangleAlert className="mt-0.5 size-5 shrink-0 text-aji" aria-hidden /> {describirOperacion(o, vista)}
                  </p>
                  <p className="mt-1 text-base">{o.error}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variante="secundario" className="flex-1" onClick={() => motor?.reintentar(o.clave)}>
                      <Undo2 className="size-5" aria-hidden /> Reintentar
                    </Button>
                    <Button variante="peligro" className="flex-1" onClick={() => motor?.descartar(o.clave)}>
                      <Trash2 className="size-5" aria-hidden /> Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendientes.length > 0 && (
          <section aria-label="Por subir" className="space-y-2">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none">Por subir ({pendientes.length})</h2>
            <ul className="divide-y-2 divide-dashed divide-tinta/30 rounded-xl border-2 border-tinta bg-papel">
              {pendientes.map((o) => (
                <li key={o.clave} className="px-3 py-2 text-base">
                  <span className="font-bold">{describirOperacion(o, vista)}</span>
                  {o.intentos > 0 && <span className="block text-base text-tinta-2">Intentos: {o.intentos}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendientes.length === 0 && problemas.length === 0 && (
          <p className="flex items-center gap-2 text-lg font-bold">
            <ReceiptText className="size-5" aria-hidden /> Nada por subir.
          </p>
        )}
      </main>
    </>
  );
}

/** Pantalla de algo que necesita señal: explica y lleva a la app normal. */
export function RequiereConexion({ ruta }: { ruta: string }) {
  const enLinea = useEnLinea();
  return (
    <>
      <EncabezadoPantalla titulo="Necesita señal" atras="/inicio" />
      <main className="flex flex-1 flex-col items-start gap-4 px-4 pt-6">
        <CloudOff className="size-10" aria-hidden />
        <p className="text-lg">Esta pantalla muestra datos del servidor y no se puede usar sin conexión. Lo demás sigue funcionando.</p>
        <a href={ruta} aria-disabled={!enLinea} className={botonVariantes({ tamano: "lg", bloque: true })}>
          {enLinea ? "Abrir ahora" : "Intentar de nuevo"}
        </a>
        <Enlace href="/inicio" className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
          Volver a lo que sí funciona
        </Enlace>
      </main>
    </>
  );
}

/** Confirmación de un gasto anotado sin señal. */
export function GastoGuardado({ monto, pendiente }: { monto: number; pendiente: boolean }) {
  return (
    <>
      <EncabezadoPantalla titulo="Gasto guardado" atras="/inicio" />
      <main className="flex flex-1 flex-col items-start gap-4 px-4 pt-6">
        <Aviso tipo="ok">
          Gasto de {formatearPesos(monto)} guardado.{pendiente ? " Se sube solo cuando vuelva la señal." : ""}
        </Aviso>
        <Enlace href="/gastos/nuevo" className={botonVariantes({ tamano: "lg", bloque: true })}>
          <Wallet className="size-5" aria-hidden /> Anotar otro gasto
        </Enlace>
        <Enlace href="/inicio" className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
          Volver al inicio
        </Enlace>
      </main>
    </>
  );
}
