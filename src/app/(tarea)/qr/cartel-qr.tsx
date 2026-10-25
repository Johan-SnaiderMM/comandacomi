"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Download, Printer } from "lucide-react";
import { MARGEN_QR, trazoQr, useQr } from "@/components/clientes/codigo-qr";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { ALTO_CARTEL, ANCHO_CARTEL, dibujarCartel } from "@/lib/cartel";

const sinSuscripcion = () => () => {};
const origenDelNavegador = () => window.location.origin;
const origenDelServidor = () => "";

/**
 * Cartel del QR para el mostrador. «Imprimir» saca solo el cartel (reglas de impresión en globals.css; en el celular
 * sirve para guardarlo como PDF) y «Guardar imagen» da un PNG para mandarlo a la papelería.
 */
export function CartelQr({ slug, nombre }: { slug: string; nombre: string }) {
  const origen = useSyncExternalStore(sinSuscripcion, origenDelNavegador, origenDelServidor);
  const enlace = `${origen}/pedir/${slug}`;
  const enlaceVisible = enlace.replace(/^https?:\/\//, "");
  const { qr, fallo } = useQr(origen ? enlace : "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const titulo = useRef<HTMLParagraphElement>(null);
  const texto = useRef<HTMLParagraphElement>(null);
  const listo = origen !== "" && qr !== null;

  async function guardarImagen() {
    if (!qr) return;
    setError(null);
    setGuardando(true);
    try {
      const lienzo = document.createElement("canvas");
      lienzo.width = ANCHO_CARTEL;
      lienzo.height = ALTO_CARTEL;
      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("sin lienzo");
      // Las mismas letras del cartel en pantalla (ya están cargadas en la página).
      dibujarCartel(ctx, {
        nombre,
        enlaceVisible,
        qr,
        fuenteTitulos: titulo.current ? getComputedStyle(titulo.current).fontFamily : "sans-serif",
        fuenteTexto: texto.current ? getComputedStyle(texto.current).fontFamily : "sans-serif",
      });
      const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/png"));
      if (!blob) throw new Error("sin imagen");
      const archivo = new File([blob], `qr-${slug}.png`, { type: "image/png" });
      // En el celular se abre "Compartir" (WhatsApp, guardar en fotos…). En un computador se descarga el archivo, que
      // es lo que uno espera allí (y lo que sirve para llevarlo a imprimir).
      const esTactil = window.matchMedia("(pointer: coarse)").matches;
      if (esTactil && typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: `QR para pedir en ${nombre}` });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return; // la persona cerró el menú de compartir
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = archivo.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("No se pudo crear la imagen. Usa «Imprimir» y elige «Guardar como PDF».");
    } finally {
      setGuardando(false);
    }
  }

  const total = qr ? qr.lado + MARGEN_QR * 2 : 0;

  return (
    <>
      <div className="no-imprimir space-y-3 px-4 pt-3">
        <p className="text-base text-tinta-2">Imprímelo y pégalo en el mostrador, en las mesas o en la bolsa del domicilio. Quien lo escanee entra a pedir.</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {fallo && <Aviso tipo="error">No se pudo generar el código. Recarga la pantalla.</Aviso>}
        <div className="grid gap-2">
          <Button tamano="lg" bloque disabled={!listo} onClick={() => window.print()}>
            <Printer className="size-5" aria-hidden /> Imprimir
          </Button>
          <Button variante="secundario" tamano="lg" bloque disabled={!listo || guardando} onClick={() => void guardarImagen()}>
            <Download className="size-5" aria-hidden /> {guardando ? "Creando la imagen…" : "Guardar como imagen"}
          </Button>
        </div>
      </div>

      {/* El cartel: lo único que sale en la hoja al imprimir. */}
      <section aria-label="Cartel con el código QR" className="cartel-qr mx-4 mt-4 overflow-hidden border-4 border-tinta bg-papel text-center text-tinta">
        <div className="border-b-4 border-tinta bg-sol px-3 py-4">
          <p ref={titulo} className="font-display text-[2.75rem] font-extrabold uppercase leading-[0.95] tracking-tight">
            Pide desde tu celular
          </p>
        </div>
        <div className="px-4 pt-4 pb-5">
          <p className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight">{nombre}</p>
          <div className="mx-auto mt-4 w-full max-w-64">
            {qr ? (
              <svg viewBox={`${-MARGEN_QR} ${-MARGEN_QR} ${total} ${total}`} role="img" aria-label={`Código QR para pedir en ${nombre}`} className="w-full border-4 border-tinta bg-papel" shapeRendering="crispEdges">
                <rect x={-MARGEN_QR} y={-MARGEN_QR} width={total} height={total} fill="#ffffff" />
                <path d={trazoQr(qr)} fill="#16140f" />
              </svg>
            ) : (
              <div className="aspect-square w-full animate-pulse bg-tinta/10" aria-label="Generando el código" />
            )}
          </div>
          <p className="font-display mt-4 text-3xl font-extrabold uppercase leading-none tracking-tight">Escanea con la cámara</p>
          <p ref={texto} className="mt-2 text-base font-bold leading-snug">
            Elige tus platos · Envía el pedido · Pagas al recibir
          </p>
          <p className="mt-3 break-all text-base text-tinta-2">{enlaceVisible}</p>
        </div>
      </section>
    </>
  );
}
