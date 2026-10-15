"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bike, Check, ChefHat, CircleX, Clock, CloudOff, Hourglass, MapPin, PackageCheck, PartyPopper, ShoppingBag } from "lucide-react";
import { cancelarPedidoCliente } from "@/app/acciones/publico";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { formatearPesos } from "@/lib/dinero";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { horaCorta } from "@/lib/fechas";
import type { SeguimientoPublico } from "@/lib/publico/tipos";
import {
  intervaloDeConsulta,
  minutosRestantes,
  MOTIVO_CANCELADO_POR_CLIENTE,
  pasosDeSeguimiento,
  progresoDePlatos,
  seguimientoTerminado,
} from "@/lib/seguimiento";
import { vibrar } from "@/lib/sonido";
import { cn } from "@/lib/utils";
import { AvisarPedido } from "./avisar-pedido";

/**
 * Seguimiento del pedido en vivo: la pantalla pregunta al servidor cada pocos segundos (más espaciado si lleva rato
 * igual) y se detiene sola cuando el pedido termina. Muestra la etapa, el tiempo estimado y cada plato con su ✓.
 */
export function SeguimientoPedido({ token, inicial }: { token: string; inicial: SeguimientoPublico }) {
  const [s, setS] = useState(inicial);
  const [sinSenal, setSinSenal] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, empezar] = useTransition();
  const etapa = useRef(inicial.pedido.etapa);
  const ultimoCambio = useRef(0); // hora (ms) del último cambio de etapa; se fija al empezar a consultar

  // Consulta periódica.
  useEffect(() => {
    let parado = false;
    let reloj = 0;
    ultimoCambio.current = Date.now();

    const consultar = async () => {
      if (parado || document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/seguimiento/${token}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`estado ${r.status}`);
        const nuevo = (await r.json()) as SeguimientoPublico;
        if (parado) return;
        setS(nuevo);
        setSinSenal(false);
        if (nuevo.pedido.etapa !== etapa.current) {
          etapa.current = nuevo.pedido.etapa;
          ultimoCambio.current = Date.now();
          if (nuevo.pedido.etapa === "listo") vibrar("plato-listo");
        }
      } catch {
        if (!parado) setSinSenal(true);
      }
    };

    const ciclo = async () => {
      await consultar();
      if (parado || seguimientoTerminado(etapa.current)) return;
      reloj = window.setTimeout(() => void ciclo(), intervaloDeConsulta((Date.now() - ultimoCambio.current) / 1000));
    };

    reloj = window.setTimeout(() => void ciclo(), intervaloDeConsulta(0));
    const alVolver = () => {
      if (document.visibilityState === "visible" && !seguimientoTerminado(etapa.current)) void consultar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      parado = true;
      window.clearTimeout(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [token]);

  const p = s.pedido;
  const domicilio = p.tipo === "domicilio";

  // El título de la pestaña dice cómo va el pedido (se ve aunque la pantalla esté en segundo plano).
  useEffect(() => {
    const original = document.title;
    const texto = { por_confirmar: "Esperando confirmación", preparando: "Preparando tu pedido", listo: "¡Tu pedido está listo!", entregado: "Pedido entregado", cancelado: "Pedido cancelado" }[p.etapa];
    document.title = `${texto} · ${s.restaurante.nombre}`;
    return () => {
      document.title = original;
    };
  }, [p.etapa, s.restaurante.nombre]);

  // Un pedido terminado ya no es "en curso" para el panel de pedir.
  useEffect(() => {
    if (!seguimientoTerminado(p.etapa)) return;
    try {
      const clave = `pedido-en-curso:${s.restaurante.slug}`;
      const guardado = JSON.parse(window.localStorage.getItem(clave) ?? "{}") as { token?: string };
      if (guardado.token === token) window.localStorage.removeItem(clave);
    } catch {
      // sin localStorage no hay nada que limpiar
    }
  }, [p.etapa, s.restaurante.slug, token]);

  const restante = minutosRestantes(s);
  const progreso = progresoDePlatos(s.items);
  const pasos = pasosDeSeguimiento(s);

  function cancelar() {
    setError(null);
    empezar(async () => {
      let r;
      try {
        r = await cancelarPedidoCliente(token);
      } catch {
        r = { ok: false as const, error: MENSAJE_GENERICO };
      }
      if (!r.ok) {
        setError(r.error);
        setConfirmando(false);
        return;
      }
      setConfirmando(false);
      setS((v) => ({ ...v, pedido: { ...v.pedido, etapa: "cancelado", motivo: MOTIVO_CANCELADO_POR_CLIENTE } }));
      etapa.current = "cancelado";
    });
  }

  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <p className="text-sm font-bold uppercase tracking-wide">Seguimiento de tu pedido</p>
        <h1 className="font-display mt-0.5 text-4xl font-extrabold uppercase leading-[0.95] tracking-tight">{s.restaurante.nombre}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-lg font-bold">
          {domicilio ? <Bike className="size-5" aria-hidden /> : <ShoppingBag className="size-5" aria-hidden />}
          Pedido #{p.numero} · {domicilio ? "Domicilio" : "Para recoger"}
        </p>
      </header>

      <main className="space-y-4 px-4 pb-10 pt-4" aria-live="polite">
        {sinSenal && (
          <p role="status" className="flex items-center gap-2 rounded-xl border-2 border-tinta bg-sol-suave px-3 py-2 text-base font-bold">
            <CloudOff className="size-5 shrink-0" aria-hidden /> Sin señal. Te mostramos lo último que supimos.
          </p>
        )}

        <PanelEstado etapa={p.etapa} domicilio={domicilio} restante={restante} motivo={p.motivo} />

        {/* Justo debajo del estado: es lo que el cliente quiere hacer mientras espera (y así no tiene que bajar a buscarlo). */}
        {!seguimientoTerminado(p.etapa) && <AvisarPedido token={token} />}

        {error && <Aviso tipo="error">{error}</Aviso>}

        {p.etapa !== "cancelado" && (
          <section aria-label="Avance del pedido" className="rounded-2xl border-2 border-tinta bg-papel p-3 shadow-sello-chico">
            <ol className="space-y-3">
              {pasos.map((paso) => (
                <li key={paso.clave} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-tinta",
                      paso.hecho ? "bg-listo text-papel" : paso.actual ? "bg-sol" : "bg-papel"
                    )}
                  >
                    {paso.hecho ? <Check className="size-5" strokeWidth={4} /> : paso.actual ? <Clock className="size-5" /> : null}
                  </span>
                  <span className={cn("flex-1 text-lg leading-tight", paso.actual ? "font-extrabold" : paso.hecho ? "font-bold" : "text-tinta-2")}>
                    {paso.etiqueta}
                    <span className="sr-only">{paso.hecho ? " (hecho)" : paso.actual ? " (ahora)" : " (pendiente)"}</span>
                  </span>
                  {paso.hora && <span className="text-base text-tinta-2">{horaCorta(paso.hora)}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-label="Tus platos" className="rounded-2xl border-2 border-tinta bg-papel p-3 shadow-sello-chico">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none">Tus platos</h2>
            {p.etapa !== "cancelado" && progreso.total > 0 && (
              <span className="text-base font-bold text-tinta-2">
                {progreso.listos} de {progreso.total} listos
              </span>
            )}
          </div>
          {p.etapa === "preparando" && progreso.total > 0 && (
            <div
              role="progressbar"
              aria-label="Platos listos"
              aria-valuemin={0}
              aria-valuemax={progreso.total}
              aria-valuenow={progreso.listos}
              className="mt-2 h-3 w-full overflow-hidden rounded-full border-2 border-tinta bg-papel"
            >
              <div className="h-full bg-listo transition-[width] duration-500" style={{ width: `${(progreso.listos / progreso.total) * 100}%` }} />
            </div>
          )}
          <ul className="mt-3 divide-y-2 divide-dashed divide-tinta/25">
            {s.items.map((i, n) => (
              <li key={`${i.nombre}-${n}`} className="flex items-start gap-3 py-2">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-tinta",
                    i.listo && p.etapa !== "cancelado" ? "bg-listo text-papel" : "bg-papel"
                  )}
                >
                  {i.listo && p.etapa !== "cancelado" ? <Check className="size-4" strokeWidth={4} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-lg leading-tight">
                  <span className="cifra mr-1.5 text-xl">{i.cantidad}×</span>
                  <span className="font-bold">{i.nombre}</span>
                  {i.adiciones.length > 0 && <span className="block text-base text-tinta-2">+ {i.adiciones.join(", ")}</span>}
                  {i.notas && <span className="block text-base font-bold">“{i.notas}”</span>}
                  <span className="sr-only">{i.listo ? " (listo)" : " (en preparación)"}</span>
                </span>
              </li>
            ))}
          </ul>
          <hr className="separador-punteado my-3" />
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold">Total (pagas al recibir)</span>
            <span className="cifra text-3xl">{formatearPesos(p.total)}</span>
          </div>
        </section>

        {(p.contacto_nombre || (domicilio && p.direccion)) && (
          <section aria-label="Datos de entrega" className="rounded-2xl border-2 border-tinta bg-papel p-3 text-base shadow-sello-chico">
            {p.contacto_nombre && <p className="font-bold">{p.contacto_nombre}</p>}
            {domicilio && p.direccion && (
              <p className="mt-1 flex items-start gap-1.5">
                <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {p.direccion}
              </p>
            )}
          </section>
        )}

        <div className="space-y-2">
          {p.etapa === "por_confirmar" && (
            <Button variante="secundario" tamano="lg" bloque onClick={() => setConfirmando(true)}>
              Cancelar pedido
            </Button>
          )}
          <Link href={`/pedir/${s.restaurante.slug}`} className={botonVariantes({ variante: seguimientoTerminado(p.etapa) ? "primario" : "secundario", tamano: "lg", bloque: true })}>
            {seguimientoTerminado(p.etapa) ? "Hacer otro pedido" : "Volver al menú"}
          </Link>
        </div>
      </main>

      {confirmando && (
        <HojaInferior titulo="¿Cancelar el pedido?" onCerrar={() => setConfirmando(false)}>
          <p className="text-base text-tinta-2">Todavía no lo han aceptado, así que puedes cancelarlo sin problema.</p>
          <Button variante="peligro" tamano="lg" bloque className="mt-4" disabled={cancelando} onClick={cancelar}>
            {cancelando ? "Cancelando…" : "Sí, cancelar mi pedido"}
          </Button>
          <Button variante="fantasma" bloque className="mt-1" disabled={cancelando} onClick={() => setConfirmando(false)}>
            No, dejarlo como está
          </Button>
        </HojaInferior>
      )}
    </>
  );
}

function PanelEstado({
  etapa,
  domicilio,
  restante,
  motivo,
}: {
  etapa: SeguimientoPublico["pedido"]["etapa"];
  domicilio: boolean;
  restante: number | null;
  motivo: string | null;
}) {
  const base = "flex items-start gap-3 rounded-2xl border-2 border-tinta p-4 shadow-sello";
  switch (etapa) {
    case "por_confirmar":
      return (
        <section role="status" className={cn(base, "bg-sol-suave")}>
          <Hourglass className="mt-1 size-9 shrink-0" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-none">Esperando confirmación</h2>
            <p className="mt-1 text-lg leading-snug">El restaurante está revisando tu pedido. Normalmente tarda un par de minutos. No cierres esta pantalla: se actualiza sola.</p>
          </div>
        </section>
      );
    case "preparando":
      return (
        <section role="status" className={cn(base, "bg-sol")}>
          <ChefHat className="mt-1 size-9 shrink-0" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-none">Lo están preparando</h2>
            {restante === null ? (
              <p className="mt-1 text-lg leading-snug">Te avisamos aquí apenas esté listo.</p>
            ) : restante > 0 ? (
              <p className="mt-1 text-lg leading-snug">
                Listo en unos <span className="cifra text-3xl">{restante}</span> min.
              </p>
            ) : (
              <p className="mt-1 text-lg leading-snug">Ya casi: está tardando un poco más de lo calculado.</p>
            )}
          </div>
        </section>
      );
    case "listo":
      return (
        <section role="status" className={cn(base, "bg-listo text-papel")}>
          <PartyPopper className="mt-1 size-9 shrink-0" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-none">¡Tu pedido está listo!</h2>
            <p className="mt-1 text-lg leading-snug">{domicilio ? "Sale hacia tu dirección en un momento." : "Ya puedes pasar a recogerlo."}</p>
          </div>
        </section>
      );
    case "entregado":
      return (
        <section role="status" className={cn(base, "bg-papel")}>
          <PackageCheck className="mt-1 size-9 shrink-0" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-none">Pedido entregado</h2>
            <p className="mt-1 text-lg leading-snug">¡Buen provecho! Gracias por pedir.</p>
          </div>
        </section>
      );
    case "cancelado":
      return (
        <section role="status" className={cn(base, "bg-aji text-papel")}>
          <CircleX className="mt-1 size-9 shrink-0" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-none">Pedido cancelado</h2>
            <p className="mt-1 text-lg leading-snug">
              {motivo === MOTIVO_CANCELADO_POR_CLIENTE
                ? "Cancelaste tu pedido. Si fue sin querer, puedes volver a pedir."
                : motivo
                  ? `Motivo: ${motivo}.`
                  : "El pedido no continuó. Si tienes dudas, comunícate con el restaurante."}
            </p>
          </div>
        </section>
      );
  }
}
