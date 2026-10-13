"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { BellRing } from "lucide-react";
import { guardarAvisoCliente } from "@/app/acciones/avisos";
import { Button } from "@/components/ui/button";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { activarAvisos, avisosDisponibles } from "@/lib/push/cliente";

const sinSuscripcion = () => () => {};

/**
 * "Avísame cuando esté listo": el cliente recibe una notificación en su celular aunque cierre esta pantalla (aceptado,
 * listo, rechazado). Pide permiso solo al tocar el botón. No se muestra si el navegador no puede recibir avisos.
 */
export function AvisarPedido({ token }: { token: string }) {
  const disponible = useSyncExternalStore(sinSuscripcion, avisosDisponibles, () => false);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  if (!disponible) return null;

  if (activo) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border-2 border-tinta bg-listo-suave px-3 py-3 text-base font-bold">
        <BellRing className="size-5 shrink-0" aria-hidden /> Listo: te avisamos en este celular.
      </p>
    );
  }

  function activar() {
    setError(null);
    empezar(async () => {
      try {
        const sub = await activarAvisos("cliente");
        const r = await guardarAvisoCliente(token, sub);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setActivo(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : MENSAJE_GENERICO);
      }
    });
  }

  return (
    <div>
      <Button variante="secundario" tamano="lg" bloque disabled={ocupado} onClick={activar}>
        <BellRing className="size-5" aria-hidden /> {ocupado ? "Activando…" : "Avísame cuando esté listo"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-aji">
          {error}
        </p>
      )}
    </div>
  );
}
