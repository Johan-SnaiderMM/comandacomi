"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Anular siempre pide un motivo (nada se borra: queda quién y por qué). Motivos frecuentes de un toque.
 * `onConfirmar` devuelve un mensaje de error o null si todo salió bien (entonces la hoja se cierra).
 */
export function HojaMotivo({
  titulo,
  descripcion,
  confirmar,
  motivosRapidos,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  descripcion: string;
  confirmar: string;
  motivosRapidos: string[];
  onConfirmar: (motivo: string) => Promise<string | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function enviar() {
    empezar(async () => {
      const e = await onConfirmar(motivo);
      if (e) setError(e);
      else onCerrar();
    });
  }

  return (
    <HojaInferior titulo={titulo} onCerrar={onCerrar}>
      <p className="text-base text-tinta-2">{descripcion}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {motivosRapidos.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`min-h-12 rounded-xl border-2 border-tinta px-3 text-base font-bold active:translate-y-[2px] ${motivo === m ? "bg-sol" : "bg-papel"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Label htmlFor="motivo-anulacion">Motivo</Label>
        <Input id="motivo-anulacion" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Escribe el motivo" />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-aji">
          {error}
        </p>
      )}
      <Button variante="peligro" tamano="lg" bloque className="mt-4" disabled={pendiente || motivo.trim().length < 3} onClick={enviar}>
        {pendiente ? "Anulando…" : confirmar}
      </Button>
    </HojaInferior>
  );
}
