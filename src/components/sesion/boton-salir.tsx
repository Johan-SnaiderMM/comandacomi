"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { salirDemo } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { obtenerMotor } from "@/lib/sync/cliente";

/**
 * Salir de la demo. Antes borra las copias guardadas en el celular (el service worker y la copia local del trabajo
 * sin conexión tienen datos del restaurante). Si quedan cambios sin subir avisa: salir ahora los perdería.
 */
export function BotonSalir({ className }: { className?: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const [aviso, setAviso] = useState<number | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  function limpiarLocal() {
    obtenerMotor()?.limpiarTodo();
    if ("caches" in window) void caches.keys().then((claves) => Promise.all(claves.map((c) => caches.delete(c))));
    try {
      window.localStorage.removeItem("sc:precarga"); // la app sin conexión se vuelve a guardar en la próxima visita
    } catch {
      // sin localStorage no hay nada que borrar
    }
  }

  function limpiarYSalir() {
    limpiarLocal();
    formulario.current?.requestSubmit();
  }

  async function subirYSalir() {
    const motor = obtenerMotor();
    setSubiendo(true);
    await motor?.vaciar();
    setSubiendo(false);
    const quedan = motor?.porSubir() ?? 0;
    if (quedan > 0) setAviso(quedan);
    else limpiarYSalir();
  }

  return (
    <>
      <form
        ref={formulario}
        action={salirDemo}
        onSubmit={(e) => {
          // El envío real (requestSubmit) ya limpió todo; este primer toque solo revisa que no se pierda nada.
          const quedan = obtenerMotor()?.porSubir() ?? 0;
          if (quedan > 0) {
            e.preventDefault();
            setAviso(quedan);
          } else {
            limpiarLocal();
          }
        }}
      >
        <button type="submit" className={className}>
          <LogOut className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Salir de la demo</span>
        </button>
      </form>

      {aviso !== null && (
        <HojaInferior titulo="Hay cambios sin subir" onCerrar={() => setAviso(null)}>
          <p className="text-base">
            {aviso === 1 ? "Tienes 1 cambio" : `Tienes ${aviso} cambios`} hechos sin señal que todavía no se suben. Si sales ahora se pierden.
          </p>
          <Button tamano="lg" bloque className="mt-4" disabled={subiendo} onClick={() => void subirYSalir()}>
            {subiendo ? "Subiendo…" : "Subir ahora y salir"}
          </Button>
          <Button variante="peligro" bloque className="mt-2" disabled={subiendo} onClick={limpiarYSalir}>
            Salir sin subir (se pierden)
          </Button>
          <Button variante="fantasma" bloque className="mt-1" disabled={subiendo} onClick={() => setAviso(null)}>
            Cancelar
          </Button>
        </HojaInferior>
      )}
    </>
  );
}
