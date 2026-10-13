"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, ExternalLink, MessageCircle, QrCode, Radio } from "lucide-react";
import { configurarPedidosEnLinea } from "@/app/acciones/clientes";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { enlaceWhatsapp, mensajeInvitacionPedidos } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

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
}: {
  slug: string;
  nombre: string;
  activo: boolean;
  esDueno: boolean;
  esDemo: boolean;
}) {
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
        className={cn("rounded-2xl border-2 border-tinta p-4 shadow-sello", activo ? "bg-listo-suave" : "bg-aji-suave")}
      >
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-tinta-2">
          <Radio className="size-4 shrink-0" aria-hidden /> Estado
        </p>
        <h2 className="font-display mt-1 text-4xl font-extrabold uppercase leading-none tracking-tight">
          {activo ? "Recibiendo pedidos" : "Pedidos cerrados"}
        </h2>
        <p className="mt-2 text-base leading-snug">
          {activo
            ? "Tus clientes pueden pedir desde su celular. Cada pedido nuevo suena y espera a que lo aceptes."
            : "Nadie puede enviar pedidos nuevos. Los que ya llegaron siguen su curso."}
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

/**
 * Código QR dibujado con un solo trazo SVG (sin imágenes ni HTML inyectado). La librería se carga solo cuando se abre
 * esta hoja, para no cargar a todas las pantallas con ella.
 */
function CodigoQr({ texto }: { texto: string }) {
  const [qr, setQr] = useState<{ lado: number; trazo: string } | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    import("qrcode-generator")
      .then(({ default: qrcode }) => {
        const codigo = qrcode(0, "M");
        codigo.addData(texto);
        codigo.make();
        const lado = codigo.getModuleCount();
        let trazo = "";
        for (let fila = 0; fila < lado; fila++) {
          for (let col = 0; col < lado; col++) {
            if (codigo.isDark(fila, col)) trazo += `M${col} ${fila}h1v1h-1z`;
          }
        }
        if (!cancelado) setQr({ lado, trazo });
      })
      .catch(() => {
        if (!cancelado) setFallo(true);
      });
    return () => {
      cancelado = true;
    };
  }, [texto]);

  if (fallo) return <p className="py-8 text-center text-base font-bold text-aji">No se pudo generar el código. Usa el enlace.</p>;
  if (!qr) return <div className="size-64 animate-pulse rounded-xl bg-tinta/10" aria-label="Generando el código" />;

  const margen = 4; // zona en blanco que pide el estándar para que los celulares lo lean
  const total = qr.lado + margen * 2;
  return (
    <svg
      viewBox={`${-margen} ${-margen} ${total} ${total}`}
      role="img"
      aria-label="Código QR para pedir en línea"
      className="w-full max-w-72 rounded-xl border-2 border-tinta bg-papel"
      shapeRendering="crispEdges"
    >
      <rect x={-margen} y={-margen} width={total} height={total} fill="#ffffff" />
      <path d={qr.trazo} fill="#16140f" />
    </svg>
  );
}
