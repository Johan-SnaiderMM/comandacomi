"use client";

import { useEffect, useState } from "react";

/** El código ya calculado: `lado` módulos por lado y cuáles van en negro (fila × columna). */
export type Qr = { lado: number; oscuro: boolean[][] };

/**
 * Calcula el código QR de un texto. La librería se carga solo cuando hace falta (al abrir la hoja o el cartel), para no
 * cargar a todas las pantallas con ella.
 */
export async function calcularQr(texto: string): Promise<Qr> {
  const { default: qrcode } = await import("qrcode-generator");
  const codigo = qrcode(0, "M");
  codigo.addData(texto);
  codigo.make();
  const lado = codigo.getModuleCount();
  return { lado, oscuro: Array.from({ length: lado }, (_, fila) => Array.from({ length: lado }, (_, col) => codigo.isDark(fila, col))) };
}

/** Zona en blanco alrededor que pide el estándar para que los celulares lo lean (en módulos). */
export const MARGEN_QR = 4;

/** El código como un solo trazo SVG ("M0 0h1v1h-1z…"). */
export function trazoQr(qr: Qr): string {
  let trazo = "";
  qr.oscuro.forEach((fila, f) => fila.forEach((negro, c) => (negro ? (trazo += `M${c} ${f}h1v1h-1z`) : null)));
  return trazo;
}

/** Calcula el código de `texto` y avisa mientras tanto o si falla. */
export function useQr(texto: string): { qr: Qr | null; fallo: boolean } {
  const [estado, setEstado] = useState<{ texto: string; qr: Qr | null; fallo: boolean }>({ texto, qr: null, fallo: false });

  useEffect(() => {
    let cancelado = false;
    calcularQr(texto)
      .then((qr) => !cancelado && setEstado({ texto, qr, fallo: false }))
      .catch(() => !cancelado && setEstado({ texto, qr: null, fallo: true }));
    return () => {
      cancelado = true;
    };
  }, [texto]);

  // Mientras llega el del texto nuevo no se muestra el del anterior.
  return estado.texto === texto ? { qr: estado.qr, fallo: estado.fallo } : { qr: null, fallo: false };
}

/** Código QR dibujado con un solo trazo SVG (sin imágenes ni HTML inyectado). */
export function CodigoQr({ texto, className = "w-full max-w-72 rounded-xl border-2 border-tinta bg-papel" }: { texto: string; className?: string }) {
  const { qr, fallo } = useQr(texto);

  if (fallo) return <p className="py-8 text-center text-base font-bold text-aji">No se pudo generar el código. Usa el enlace.</p>;
  if (!qr) return <div className="size-64 animate-pulse rounded-xl bg-tinta/10" aria-label="Generando el código" />;

  const total = qr.lado + MARGEN_QR * 2;
  return (
    <svg viewBox={`${-MARGEN_QR} ${-MARGEN_QR} ${total} ${total}`} role="img" aria-label="Código QR para pedir en línea" className={className} shapeRendering="crispEdges">
      <rect x={-MARGEN_QR} y={-MARGEN_QR} width={total} height={total} fill="#ffffff" />
      <path d={trazoQr(qr)} fill="#16140f" />
    </svg>
  );
}
