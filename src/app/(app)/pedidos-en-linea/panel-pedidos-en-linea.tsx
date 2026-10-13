"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, MessageCircle, Printer, QrCode, Radio } from "lucide-react";
import { configurarPedidosEnLinea } from "@/app/acciones/clientes";
import { CodigoQr } from "@/components/clientes/codigo-qr";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { MENSAJE_GENERICO } from "@/lib/errores";
import type { Horario } from "@/lib/horario";
import { enlaceWhatsapp, mensajeInvitacionPedidos } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { HorarioAtencion } from "./horario-atencion";

const sinSuscripcion = () => () => {};
const origenDelNavegador = () => window.location.origin;
const origenDelServidor = () => "";

/**
 * Pedidos en línea: el enlace para compartir, su código QR y el interruptor para abrir o cerrar la recepción.
 * El enlace es el mismo para siempre (lleva el nombre del restaurante), así se puede imprimir o pegar en redes.
 */
export function PanelPedidosEnLinea({
  slug,
  nombre,
  activo,
  esDueno,
  esDemo,
  horario = null,
  enHorario = true,
  apertura = "",
}: {
  slug: string;
  nombre: string;
  /** El interruptor: el dueño quiere recibir pedidos en línea. */
  activo: boolean;
  esDueno: boolean;
  esDemo: boolean;
  /** Horario de atención (null = sin horario: manda solo el interruptor). */
  horario?: Horario | null;
  /** Ahora mismo es hora de atención (lo calcula el servidor al cargar la pantalla). */
  enHorario?: boolean;
  /** Si está fuera de horario: "Abre hoy a las 6:00 p. m.". */
  apertura?: string;
}) {
  // Tres estados: recibiendo, cerrado por el horario (se abre solo) o cerrado a mano.
  const estado = !activo ? "cerrado" : enHorario ? "recibiendo" : "fuera-de-horario";
  const origen = useSyncExternalStore(sinSuscripcion, origenDelNavegador, origenDelServidor);
  const ruta = `/pedir/${slug}`;
  const enlace = `${origen}${ruta}`;
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verQr, setVerQr] = useState(false);
  const [cambiando, empezar] = useTransition();
  const reloj = useRef(0);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  async function copiar() {
    setError(null);
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      window.clearTimeout(reloj.current);
      reloj.current = window.setTimeout(() => setCopiado(false), 2_500);
    } catch {
      setError("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  }

  function cambiar() {
    setError(null);
    empezar(async () => {
      let r;
      try {
        r = await configurarPedidosEnLinea(!activo);
      } catch {
        r = { ok: false as const, error: MENSAJE_GENERICO };
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Avisa al aviso de pedidos (franja de arriba) para que cambie de ritmo al instante.
      window.dispatchEvent(new Event("clientes:cambio"));
    });
  }

  return (
    <>
      {esDemo && (
        <p className="rounded-xl border-2 border-dashed border-tinta/50 bg-papel px-3 py-2 text-base text-tinta-2">
          <strong className="text-tinta">Demostración:</strong> el enlace funciona de verdad. Pídelo desde tu celular para ver cómo le llega el
          pedido al restaurante.
        </p>
      )}

      <section
        aria-label="Estado de los pedidos en línea"
        className={cn("rounded-2xl border-2 border-tinta p-4 shadow-sello", estado === "recibiendo" ? "bg-listo-suave" : estado === "cerrado" ? "bg-aji-suave" : "bg-sol-suave")}
      >
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-tinta-2">
          <Radio className="size-4 shrink-0" aria-hidden /> Estado
        </p>
        <h2 className="font-display mt-1 text-4xl font-extrabold uppercase leading-none tracking-tight">
          {estado === "recibiendo" ? "Recibiendo pedidos" : estado === "cerrado" ? "Pedidos cerrados" : "Cerrado por horario"}
        </h2>
        <p className="mt-2 text-base leading-snug">
          {estado === "recibiendo"
            ? "Tus clientes pueden pedir desde su celular. Cada pedido nuevo suena y espera a que lo aceptes."
            : estado === "cerrado"
              ? "Nadie puede enviar pedidos nuevos. Los que ya llegaron siguen su curso."
              : `A esta hora no se reciben pedidos: se abre solo según tu horario. ${apertura}`}
        </p>
        {esDueno ? (
          <Button variante={activo ? "secundario" : "exito"} tamano="lg" bloque className="mt-3" disabled={cambiando} onClick={cambiar}>
            {cambiando ? "Guardando…" : activo ? "Dejar de recibir pedidos" : "Empezar a recibir pedidos"}
          </Button>
        ) : (
          <p className="mt-3 text-base font-bold">Solo el dueño puede abrir o cerrar los pedidos en línea.</p>
        )}
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}

      <HorarioAtencion horario={horario} esDueno={esDueno} />

      <section aria-label="Enlace para tus clientes" className="rounded-2xl border-2 border-tinta bg-papel p-4 shadow-sello">
        <h2 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">Tu enlace</h2>
        <p className="mt-1 text-base text-tinta-2">Mándalo por WhatsApp, pégalo en Instagram o imprime el QR para el mostrador.</p>
        <input
          readOnly
          value={enlace}
          aria-label="Enlace para pedir en línea"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-3 min-h-12 w-full rounded-xl border-2 border-tinta bg-fondo px-3 text-base font-bold"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variante="secundario" tamano="lg" onClick={copiar}>
            {copiado ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
            {copiado ? "¡Copiado!" : "Copiar"}
          </Button>
          <a
            href={enlaceWhatsapp({ texto: mensajeInvitacionPedidos({ restaurante: nombre, enlace }) })}
            target="_blank"
            rel="noopener noreferrer"
            className={botonVariantes({ variante: "exito", tamano: "lg" })}
          >
            <MessageCircle className="size-5" aria-hidden /> WhatsApp
          </a>
          <Button variante="secundario" tamano="lg" onClick={() => setVerQr(true)}>
            <QrCode className="size-5" aria-hidden /> Código QR
          </Button>
          <a href={ruta} target="_blank" rel="noopener" className={botonVariantes({ variante: "secundario", tamano: "lg" })}>
            <ExternalLink className="size-5" aria-hidden /> Verlo como cliente
          </a>
        </div>
        <Link href="/qr" className={cn(botonVariantes({ variante: "primario", tamano: "lg", bloque: true }), "mt-2")}>
          <Printer className="size-5" aria-hidden /> Cartel con el QR para imprimir
        </Link>
      </section>

      <section aria-label="Cómo funciona" className="rounded-2xl border-2 border-tinta bg-papel p-4 shadow-sello">
        <h2 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">Cómo funciona</h2>
        <ol className="mt-3 space-y-3 text-base leading-snug">
          <Paso n={1}>El cliente abre el enlace, arma su pedido y pone su nombre, celular y dirección (o pasa a recogerlo).</Paso>
          <Paso n={2}>
            A ti te suena y te parpadea la pantalla. Lo <strong>aceptas</strong> (con el tiempo estimado) o lo rechazas con un motivo.
          </Paso>
          <Paso n={3}>
            En la <strong>plancha</strong> marcan cada plato como listo y el cliente lo ve en su celular, en vivo.
          </Paso>
        </ol>
      </section>

      {verQr && (
        <HojaInferior titulo="Código QR" onCerrar={() => setVerQr(false)}>
          <p className="text-base text-tinta-2">Quien lo escanee con la cámara del celular entra a pedir en {nombre}.</p>
          <div className="mt-3 flex justify-center">
            <CodigoQr texto={enlace} />
          </div>
          <p className="mt-3 break-all text-center text-base font-bold">{enlace}</p>
        </HojaInferior>
      )}
    </>
  );
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="cifra flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-tinta bg-sol text-lg">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
