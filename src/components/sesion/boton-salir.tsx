"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { salirDemo } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { olvidarBorradores } from "@/lib/borrador-local";
import { desactivarAvisos, suscripcionActual } from "@/lib/push/cliente";
import { obtenerMotor } from "@/lib/sync/cliente";

/** Lo que tarde de más el navegador en contestar no detiene la salida. */
function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promesa.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * Salir de la demo. Antes borra las copias guardadas en el celular (el service worker y la copia local del trabajo
 * sin conexión tienen datos del restaurante) y da de baja los avisos de este celular. Si quedan cambios sin subir
 * avisa: salir ahora los perdería.
 */
export function BotonSalir({ className }: { className?: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const campoEndpoint = useRef<HTMLInputElement>(null);
  const listoParaSalir = useRef(false);
  const reloj = useRef(0);
  const [aviso, setAviso] = useState<number | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  function limpiarLocal() {
    obtenerMotor()?.limpiarTodo();
    olvidarBorradores("pedido:"); // pedidos a medio tomar
    if ("caches" in window) void caches.keys().then((claves) => Promise.all(claves.map((c) => caches.delete(c))));
    try {
      window.localStorage.removeItem("sc:precarga"); // la app sin conexión se vuelve a guardar en la próxima visita
    } catch {
      // sin localStorage no hay nada que borrar
    }
  }

  async function limpiarYSalir() {
    setSaliendo(true);
    // Avisos de este celular: su dirección viaja con el formulario para que el servidor la borre al salir, y el
    // navegador también la suelta (si no alcanza, el servidor ya la borró: no llega nada más).
    const suscripcion = await conTope(suscripcionActual("personal"), 2000);
    if (campoEndpoint.current) campoEndpoint.current.value = suscripcion?.endpoint ?? "";
    if (suscripcion) await conTope(desactivarAvisos("personal"), 3000);
    limpiarLocal();
    listoParaSalir.current = true;
    formulario.current?.requestSubmit();
    // Si la salida no llega al servidor (sin señal), el botón vuelve a servir para reintentar.
    reloj.current = window.setTimeout(() => {
      listoParaSalir.current = false;
      setSaliendo(false);
    }, 12_000);
  }

  async function subirYSalir() {
    const motor = obtenerMotor();
    setSubiendo(true);
    await motor?.vaciar();
    setSubiendo(false);
    const quedan = motor?.porSubir() ?? 0;
    if (quedan > 0) setAviso(quedan);
    else void limpiarYSalir();
  }

  return (
    <>
      <form
        ref={formulario}
        action={salirDemo}
        onSubmit={(e) => {
          if (listoParaSalir.current) return; // segundo envío (el de verdad): ya se limpió todo
          // El primer toque no sale todavía: revisa que no se pierda nada y prepara la salida.
          e.preventDefault();
          if (saliendo) return;
          const quedan = obtenerMotor()?.porSubir() ?? 0;
          if (quedan > 0) setAviso(quedan);
          else void limpiarYSalir();
        }}
      >
        <input ref={campoEndpoint} type="hidden" name="endpoint" defaultValue="" />
        <button type="submit" className={className} disabled={saliendo}>
          <LogOut className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 text-left">{saliendo ? "Saliendo…" : "Salir de la demo"}</span>
        </button>
      </form>

      {aviso !== null && (
        <HojaInferior titulo="Hay cambios sin subir" onCerrar={() => setAviso(null)}>
          <p className="text-base">
            {aviso === 1 ? "Tienes 1 cambio" : `Tienes ${aviso} cambios`} hechos sin señal que todavía no se suben. Si sales ahora se pierden.
          </p>
          <Button tamano="lg" bloque className="mt-4" disabled={subiendo || saliendo} onClick={() => void subirYSalir()}>
            {subiendo ? "Subiendo…" : "Subir ahora y salir"}
          </Button>
          <Button variante="peligro" bloque className="mt-2" disabled={subiendo || saliendo} onClick={() => void limpiarYSalir()}>
            Salir sin subir (se pierden)
          </Button>
          <Button variante="fantasma" bloque className="mt-1" disabled={subiendo || saliendo} onClick={() => setAviso(null)}>
            Cancelar
          </Button>
        </HojaInferior>
      )}
    </>
  );
}
