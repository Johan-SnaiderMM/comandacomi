"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AccionesFiado } from "@/components/fiado/acciones-fiado";
import { Aviso } from "@/components/ui/aviso";
import type { ClienteFiado } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { diasEntre, fechaCorta, textoDias } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/** Quién debe y cuánto: el que más debe primero, con desde cuándo y los dos botones de siempre. */
export function ListaFiado({
  clientes,
  hoy,
  restaurante,
  demo,
}: {
  clientes: ClienteFiado[];
  hoy: string;
  restaurante: string;
  demo: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const conDeuda = clientes.filter((c) => c.saldo > 0);
  const alDia = clientes.filter((c) => c.saldo <= 0);
  const total = conDeuda.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="space-y-4 px-4 pt-3">
      {aviso && (
        <Aviso tipo="ok" onCerrar={() => setAviso(null)}>
          {aviso}
        </Aviso>
      )}

      <section aria-label="Total por cobrar" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Por cobrar</p>
        <p className={cn("cifra text-[3rem]", total > 0 && "text-aji")}>{formatearPesos(total)}</p>
        <p className="text-base text-tinta-2">
          {conDeuda.length === 0 ? "Nadie te debe nada." : `${conDeuda.length} ${conDeuda.length === 1 ? "cliente te debe" : "clientes te deben"}`}
        </p>
      </section>

      <ul className="space-y-3">
        {conDeuda.map((c) => {
          const dias = c.debe_desde ? diasEntre(c.debe_desde, hoy) : 0;
          return (
            <li key={c.id} className="rounded-2xl border-2 border-tinta bg-papel p-3 shadow-sello-chico">
              <Link href={`/fiado/${c.id}`} className="flex min-h-12 items-center justify-between gap-2 active:opacity-70">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold leading-tight">{c.nombre}</span>
                  <span className={cn("block text-sm", dias >= 5 ? "font-bold text-aji" : "text-tinta-2")}>
                    {c.debe_desde ? `Debe desde ${textoDias(dias)} · ${fechaCorta(c.debe_desde)}` : "Con deuda"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="cifra text-3xl text-aji">{formatearPesos(c.saldo)}</span>
                  <ChevronRight className="size-5" aria-hidden />
                </span>
              </Link>
              <div className="mt-2">
                <AccionesFiado cliente={c} saldo={c.saldo} restaurante={restaurante} demo={demo} onAbono={setAviso} />
              </div>
            </li>
          );
        })}
      </ul>

      {alDia.length > 0 && (
        <details className="rounded-2xl border-2 border-tinta bg-papel">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-bold">
            Al día ({alDia.length})<ChevronRight className="size-5" aria-hidden />
          </summary>
          <ul className="divide-y-2 divide-dashed divide-tinta/30 border-t-2 border-tinta">
            {alDia.map((c) => (
              <li key={c.id}>
                <Link href={`/fiado/${c.id}`} className="flex min-h-12 items-center justify-between px-4 text-base active:bg-tinta/10">
                  <span className="font-bold">{c.nombre}</span>
                  <span className="text-tinta-2">Sin deuda</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
