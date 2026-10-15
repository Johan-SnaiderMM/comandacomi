"use client";

import { useState, useTransition } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { cambiarMiClave } from "@/app/acciones/sesion";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MENSAJE_GENERICO } from "@/lib/errores";

/**
 * Más → "Mi contraseña" (el dueño de un restaurante de verdad): la cambia por una suya, por ejemplo la primera vez,
 * después de entrar con la temporal que le dieron al instalar la app.
 */
export function BotonClave({ className }: { className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, empezar] = useTransition();

  function cerrar() {
    setAbierta(false);
    setClave("");
    setRepetir("");
    setError(null);
  }

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await cambiarMiClave({ clave, repetir }).catch(() => ({ ok: false as const, error: MENSAJE_GENERICO }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      cerrar();
      setListo(true);
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <KeyRound className="size-6 shrink-0" aria-hidden />
        <span className="flex-1 text-left leading-tight">
          Mi contraseña
          <span className="block text-base font-normal text-tinta-2">Cámbiala por una que solo tú sepas</span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </button>
      {listo && (
        <Aviso tipo="ok" onCerrar={() => setListo(false)}>
          Listo: tu contraseña cambió. La próxima vez entra con la nueva.
        </Aviso>
      )}

      {abierta && (
        <HojaInferior titulo="Mi contraseña" onCerrar={cerrar}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="clave-nueva">Contraseña nueva</Label>
              <Input id="clave-nueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} maxLength={72} />
              <p className="mt-1 text-base text-tinta-2">Al menos 8 letras o números.</p>
            </div>
            <div>
              <Label htmlFor="clave-repetir">Escríbela otra vez</Label>
              <Input id="clave-repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} maxLength={72} />
            </div>
            {error && (
              <p role="alert" className="text-base font-bold text-aji">
                {error}
              </p>
            )}
            <Button tamano="lg" bloque disabled={pendiente || clave.length < 8 || repetir.length === 0} onClick={guardar}>
              {pendiente ? "Guardando…" : "Cambiar la contraseña"}
            </Button>
          </div>
        </HojaInferior>
      )}
    </>
  );
}
