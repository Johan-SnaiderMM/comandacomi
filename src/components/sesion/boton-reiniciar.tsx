"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { reiniciarDemo } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suscripcionActual } from "@/lib/push/cliente";

/**
 * Reiniciar demo: borra lo creado en la demo (pedidos, gastos, cuentas, cambios al menú), le pone el nombre del local
 * que se va a visitar y vuelve a cargar los datos de ejemplo. Pide confirmación porque no se puede deshacer. La base
 * solo lo permite en restaurantes de demostración.
 *
 * `conPin`: la demo tiene PIN (lo pone quien la administra, desde la base) y sin él no se reinicia. Así un visitante con
 * el enlace no la reinicia en plena visita. El PIN lo comprueba la base, no esta pantalla.
 */
export function BotonReiniciar({ className, nombreActual, conPin = false }: { className?: string; nombreActual: string; conPin?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function reiniciar() {
    setError(null);
    empezar(async () => {
      // Reiniciar da de baja los avisos de los celulares de la visita anterior; el de este celular se conserva.
      const esteCelular = await suscripcionActual("personal").catch(() => null);
      const r = await reiniciarDemo(nombre, esteCelular?.endpoint ?? null, pin); // si sale bien, el servidor redirige a Inicio
      if (r && !r.ok) {
        setError(r.error);
        setPin("");
      }
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <RotateCcw className="size-6 shrink-0" aria-hidden />
        <span className="flex-1 text-left leading-tight">
          Reiniciar demo
          <span className="block text-base font-normal text-tinta-2">Cambia el nombre del local y recarga los datos</span>
        </span>
      </button>

      {abierta && (
        <HojaInferior titulo="¿Reiniciar la demo?" onCerrar={() => setAbierta(false)}>
          <Label htmlFor="nombre-restaurante">Nombre del restaurante que vas a visitar</Label>
          <Input
            id="nombre-restaurante"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={60}
            enterKeyHint="done"
            placeholder={nombreActual}
            disabled={pendiente}
          />
          {conPin && (
            <div className="mt-3">
              <Label htmlFor="pin-reinicio">PIN de reinicio</Label>
              <Input
                id="pin-reinicio"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                maxLength={8}
                placeholder="Solo quien enseña la demo lo sabe"
                disabled={pendiente}
              />
            </div>
          )}
          <p className="mt-3 text-base">Se borra todo lo que creaste (pedidos, gastos, cobros, fiado y cambios al menú) y vuelven los datos de ejemplo de los últimos 7 días.</p>
          <p className="mt-2 text-base">Los demás celulares dejan de recibir avisos de esta demo; el de este celular se conserva.</p>
          <p className="mt-2 text-base font-bold">Esto no se puede deshacer.</p>
          {error && (
            <p role="alert" className="mt-2 text-base font-bold text-aji">
              {error}
            </p>
          )}
          <Button variante="peligro" tamano="lg" bloque className="mt-4" disabled={pendiente || nombre.trim() === "" || (conPin && pin.length < 4)} onClick={reiniciar}>
            {pendiente ? "Reiniciando…" : "Sí, reiniciar la demo"}
          </Button>
          <Button variante="fantasma" bloque className="mt-1" disabled={pendiente} onClick={() => setAbierta(false)}>
            Cancelar
          </Button>
        </HojaInferior>
      )}
    </>
  );
}
