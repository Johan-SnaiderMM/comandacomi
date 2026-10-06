"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { anularAbono } from "@/app/acciones/fiado";
import { AccionesFiado } from "@/components/fiado/acciones-fiado";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HojaMotivo } from "@/components/ui/hoja-motivo";
import type { FichaFiado } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { fechaCorta, horaCorta } from "@/lib/fechas";
import { formatearTelefono } from "@/lib/telefono";
import { cn } from "@/lib/utils";

/** Ficha de un cliente: cuánto debe, acciones y el libro de cargos y abonos (lo anulado queda a la vista, tachado). */
export function Ficha({ ficha, restaurante, demo }: { ficha: FichaFiado; restaurante: string; demo: boolean }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; monto: number } | null>(null);

  return (
    <div className="space-y-4 px-4 pt-3 pb-8">
      {aviso && (
        <Aviso tipo="ok" onCerrar={() => setAviso(null)}>
          {aviso}
        </Aviso>
      )}

      <section aria-label="Saldo" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">{ficha.saldo > 0 ? "Debe" : "Al día"}</p>
        <p className={cn("cifra text-[3rem]", ficha.saldo > 0 && "text-aji")}>{formatearPesos(ficha.saldo)}</p>
        {ficha.cliente.telefono && <p className="text-base text-tinta-2">{formatearTelefono(ficha.cliente.telefono)}</p>}
      </section>

      <AccionesFiado cliente={ficha.cliente} saldo={ficha.saldo} restaurante={restaurante} demo={demo} onAbono={setAviso} />

      <section aria-label="Movimientos">
        <h2 className="font-display mb-2 text-2xl font-extrabold uppercase leading-none">Movimientos</h2>
        {ficha.movimientos.length === 0 ? (
          <p className="text-lg text-tinta-2">Todavía no tiene movimientos.</p>
        ) : (
          <ul className="space-y-2">
            {ficha.movimientos.map((m) => (
              <li key={m.id} className={cn("rounded-xl border-2 border-tinta bg-papel p-3", m.anulado && "bg-tinta/5")}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn(m.anulado && "line-through opacity-60")}>
                    <p className="flex items-center gap-2 text-base font-bold">
                      <Badge variante={m.tipo === "cargo" ? "aji" : "listo"}>{m.tipo === "cargo" ? "Fiado" : "Abono"}</Badge>
                      {m.pedido_numero ? `Pedido #${m.pedido_numero}` : m.medio === "transferencia" ? "Nequi" : "Efectivo"}
                    </p>
                    <p className="mt-0.5 text-sm text-tinta-2">
                      {fechaCorta(m.fecha)} · {horaCorta(m.created_at)}
                      {m.referencia && ` · ${m.referencia}`}
                    </p>
                  </div>
                  <p className={cn("cifra text-2xl", m.anulado && "line-through opacity-60", !m.anulado && (m.tipo === "cargo" ? "text-aji" : "text-listo"))}>
                    {m.tipo === "cargo" ? "+" : "−"} {formatearPesos(m.monto)}
                  </p>
                </div>
                {m.anulado && <p className="mt-1 text-sm font-bold">Anulado: {m.anulado_motivo}</p>}
                {!m.anulado && m.tipo === "abono" && (
                  <Button variante="fantasma" className="mt-1 -ml-2" onClick={() => setAnulando({ id: m.id, monto: m.monto })}>
                    <Undo2 className="size-5" aria-hidden /> Anular abono
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {anulando && (
        <HojaMotivo
          titulo="Anular abono"
          descripcion={`Se anula el abono de ${formatearPesos(anulando.monto)} y la deuda vuelve a subir. Queda registrado con el motivo.`}
          confirmar="Anular abono"
          motivosRapidos={["Lo anoté al cliente equivocado", "Monto mal digitado", "Duplicado"]}
          onConfirmar={async (motivo) => {
            const r = await anularAbono(anulando.id, motivo);
            if (r.ok) setAviso("Abono anulado.");
            return r.ok ? null : r.error;
          }}
          onCerrar={() => setAnulando(null)}
        />
      )}
    </div>
  );
}
