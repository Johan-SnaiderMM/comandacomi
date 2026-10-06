"use client";

import { useState, useTransition } from "react";
import { Banknote, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Segmentado } from "@/components/ui/segmentado";
import { TecladoNumerico } from "@/components/ui/teclado-numerico";
import { formatearPesos, validarAbono, type MedioAbono } from "@/lib/dinero";
import { nombreCorto } from "@/lib/nombres";
import { registrarAbono } from "@/lib/sync/acciones";
import { aplicarTecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";

/** Abono a la deuda: cuánto pagó y cómo. No deja pasarse del saldo. */
export function HojaAbono({
  cliente,
  saldo,
  onHecho,
  onCerrar,
}: {
  cliente: { id: string; nombre: string };
  saldo: number;
  onHecho: (mensaje: string) => void;
  onCerrar: () => void;
}) {
  const [monto, setMonto] = useState(0);
  const [medio, setMedio] = useState<MedioAbono>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const validacion = monto > 0 ? validarAbono(saldo, monto) : null;
  const excede = validacion !== null && !validacion.ok;

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await registrarAbono({ clienteId: cliente.id, monto, medio, referencia }, saldo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const aviso = r.datos.saldo === 0 ? `${cliente.nombre} quedó al día. Abono de ${formatearPesos(monto)} registrado.` : `Abono de ${formatearPesos(monto)} registrado. ${cliente.nombre} debe ${formatearPesos(r.datos.saldo)}.`;
      onHecho(r.datos.pendiente ? `${aviso} Sin señal: se sube solo cuando vuelva.` : aviso);
      onCerrar();
    });
  }

  const atajos = [...new Set([Math.floor(saldo / 2 / 1000) * 1000, saldo])].filter((v) => v > 0);

  return (
    <HojaInferior titulo={`Abono · ${nombreCorto(cliente.nombre)}`} onCerrar={onCerrar}>
      <Segmentado<MedioAbono>
        etiqueta="Cómo pagó"
        valor={medio}
        onCambio={setMedio}
        opciones={[
          { valor: "efectivo", etiqueta: "Efectivo", icono: <Banknote className="size-5" aria-hidden /> },
          { valor: "transferencia", etiqueta: "Nequi", icono: <Smartphone className="size-5" aria-hidden /> },
        ]}
      />

      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border-2 border-tinta bg-papel px-3 py-1">
        <div>
          <p className="text-xs font-bold uppercase leading-tight tracking-wide text-tinta-2">Abona</p>
          <p className={cn("cifra text-[2.25rem]", excede && "text-aji")}>{formatearPesos(monto)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase leading-tight tracking-wide text-tinta-2">Debe</p>
          <p className="cifra text-[2.25rem] text-aji">{formatearPesos(saldo)}</p>
        </div>
      </div>

      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${atajos.length}, minmax(0, 1fr))` }}>
        {atajos.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMonto(v)}
            className={cn("min-h-12 rounded-xl border-2 border-tinta text-base font-bold active:translate-y-[2px]", monto === v ? "bg-sol" : "bg-papel")}
          >
            {v === saldo ? `Todo ${formatearPesos(v)}` : formatearPesos(v)}
          </button>
        ))}
      </div>

      <TecladoNumerico className="mt-2" onTecla={(t) => setMonto((v) => aplicarTecla(v, t))} />

      {medio === "transferencia" && (
        <Input className="mt-2" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} placeholder="Referencia (opcional)" aria-label="Referencia de la transferencia" />
      )}

      {(excede || error) && (
        <p role="alert" className="mt-2 text-base font-bold text-aji">
          {error ?? (validacion && !validacion.ok ? validacion.error : "")}
        </p>
      )}

      <Button tamano="lg" bloque className="mt-3" variante="exito" disabled={pendiente || monto <= 0 || excede} onClick={guardar}>
        {pendiente ? "Guardando…" : monto > 0 ? `Registrar abono de ${formatearPesos(monto)}` : "Escribe cuánto abona"}
      </Button>
    </HojaInferior>
  );
}
