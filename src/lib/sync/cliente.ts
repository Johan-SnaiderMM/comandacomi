"use client";

/**
 * El motor del trabajo sin conexión en el navegador: un solo Motor por pestaña, con la copia y la cola guardadas
 * en localStorage, y los ganchos de React para leer su estado. Todo lo que cambia datos pasa por aquí
 * (ver acciones.ts) para que funcione igual con y sin señal.
 */
import { useSyncExternalStore } from "react";
import { aplicarOperacion, obtenerSnapshot } from "@/app/acciones/sync";
import { almacenLocal } from "./almacen";
import { CLAVE_COLA, CLAVE_SNAPSHOT, Motor, type EstadoMotor } from "./motor";
import type { Snapshot } from "./tipos";

/** Si el servidor no contesta en este tiempo se considera que no hay señal (la operación se guarda y se reintenta). */
const LIMITE_MS = 20_000;

function conLimite<T>(promesa: Promise<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error("tiempo agotado")), LIMITE_MS);
    promesa.then(
      (v) => {
        clearTimeout(reloj);
        resolver(v);
      },
      (e) => {
        clearTimeout(reloj);
        rechazar(e);
      }
    );
  });
}

let motor: Motor | null = null;
let escuchandoOtrasPestanas = false;

/** El motor de esta pestaña (null en el servidor: allí no hay nada que sincronizar). */
export function obtenerMotor(): Motor | null {
  if (typeof window === "undefined") return null;
  motor ??= new Motor({
    almacen: almacenLocal(),
    enLinea: () => navigator.onLine,
    transporte: (op) => conLimite(aplicarOperacion({ clave: op.clave, tipo: op.tipo, ocurridoEn: op.ocurridoEn, datos: op.datos })),
    descargarSnapshot: () => conLimite(obtenerSnapshot()),
  });
  if (!escuchandoOtrasPestanas) {
    escuchandoOtrasPestanas = true;
    // Dos pestañas de la app comparten la misma cola guardada: lo que una cambia, la otra lo lee (no se pisan).
    window.addEventListener("storage", (e) => {
      if (e.key === CLAVE_COLA || e.key === CLAVE_SNAPSHOT || e.key === null) motor?.recargarDesdeAlmacen();
    });
  }
  return motor;
}

// ----------------------------------------------------------------------------------------- estado de la red

let enLineaActual = true;
let redIniciada = false;
const oyentesRed = new Set<() => void>();

function iniciarRed() {
  if (redIniciada || typeof window === "undefined") return;
  redIniciada = true;
  enLineaActual = navigator.onLine;
  const cambio = () => {
    enLineaActual = navigator.onLine;
    oyentesRed.forEach((o) => o());
  };
  window.addEventListener("online", cambio);
  window.addEventListener("offline", cambio);
}

function suscribirRed(oyente: () => void) {
  iniciarRed();
  oyentesRed.add(oyente);
  return () => {
    oyentesRed.delete(oyente);
  };
}

/** ¿El aparato dice que hay red? (navigator.onLine; "no" es seguro, "sí" no garantiza que el servidor conteste). */
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribirRed,
    () => enLineaActual,
    () => true
  );
}

// ---------------------------------------------------------------------------------------- estado del motor

const ESTADO_VACIO: EstadoMotor = { snapshot: null, ops: [], sincronizando: false, sinRed: false, sinSesion: false };

const suscribirMotor = (oyente: () => void) => obtenerMotor()?.suscribir(oyente) ?? (() => {});

export function useEstadoSync(): EstadoMotor {
  return useSyncExternalStore(
    suscribirMotor,
    () => obtenerMotor()?.estado() ?? ESTADO_VACIO,
    () => ESTADO_VACIO
  );
}

/** Lo que hay que mostrar sin conexión: la última copia con la cola encima (null si nunca se guardó una copia). */
export function useVista(): Snapshot | null {
  return useSyncExternalStore(
    suscribirMotor,
    () => obtenerMotor()?.vista() ?? null,
    () => null
  );
}

/** Cuántas operaciones faltan por subir, cuántas tienen problema y si hay una subida en marcha. */
export function useResumenSync() {
  const e = useEstadoSync();
  return {
    porSubir: e.ops.filter((o) => o.estado === "pendiente").length,
    conProblema: e.ops.filter((o) => o.estado === "fallida").length,
    sincronizando: e.sincronizando,
    sinRed: e.sinRed,
    sinSesion: e.sinSesion,
  };
}
