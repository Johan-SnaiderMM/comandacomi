"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { anularGasto } from "@/app/acciones/gastos";
import { IconoCategoria } from "@/components/gastos/icono-categoria";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HojaMotivo } from "@/components/ui/hoja-motivo";
import type { GastosDelDia } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { horaCorta } from "@/lib/fechas";
import { CATEGORIAS_GASTO, ETIQUETA_CATEGORIA } from "@/lib/gastos";
import { cn } from "@/lib/utils";

const ICONO = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.valor, c.icono]));

/** Gastos de hoy: total arriba y cada gasto con su categoría, nota, hora y foto. Anular pide motivo. */
export function ListaGastos({ dia, guardado }: { dia: GastosDelDia; guardado: number | null }) {
  const router = useRouter();
  const [aviso, setAviso] = useState(guardado);
  const [anulando, setAnulando] = useState<{ id: string; monto: number; categoria: string } | null>(null);
  const vigentes = dia.gastos.filter((g) => !g.anulado);

  return (
    <div className="space-y-3 px-4 pt-3">
      {aviso && (
        <Aviso
          tipo="ok"
          onCerrar={() => {
            setAviso(null);
            router.replace("/gastos");
          }}
        >
          Gasto de {formatearPesos(aviso)} guardado.
        </Aviso>
      )}

      <section aria-label="Total de gastos de hoy" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Gastado hoy</p>
        <p className="cifra text-[3rem]">{formatearPesos(dia.total)}</p>
        <p className="text-base text-tinta-2">{vigentes.length === 0 ? "Aún no hay gastos." : `${vigentes.length} ${vigentes.length === 1 ? "gasto" : "gastos"}`}</p>
      </section>

      {dia.gastos.length === 0 ? (
        <p className="pt-4 text-lg text-tinta-2">Cuando compres carne, pan, gas o pagues al domiciliario, anótalo aquí para saber si de verdad ganaste.</p>
      ) : (
        <ul className="space-y-2">
          {dia.gastos.map((g) => (
            <li key={g.id} className={cn("rounded-xl border-2 border-tinta bg-papel p-3", g.anulado && "bg-tinta/5")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-tinta bg-sol-suave", g.anulado && "opacity-50")}>
                  <IconoCategoria nombre={ICONO[g.categoria]} className="size-6" />
                </span>
                <div className={cn("min-w-0 flex-1", g.anulado && "line-through opacity-60")}>
                  <p className="flex flex-wrap items-center gap-x-2 text-base font-bold leading-tight">
                    {ETIQUETA_CATEGORIA[g.categoria]}
                    {!g.de_caja && <Badge className="no-underline">Pagado aparte</Badge>}
                  </p>
                  {g.nota && <p className="text-base text-tinta-2">{g.nota}</p>}
                  <p className="text-base text-tinta-2">{horaCorta(g.created_at)}</p>
                </div>
                <p className={cn("cifra text-2xl", g.anulado && "line-through opacity-60")}>{formatearPesos(g.monto)}</p>
              </div>

              {g.foto_path && !g.anulado && (
                <a href={`/api/foto?ruta=${encodeURIComponent(g.foto_path)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida por /api/foto (no se optimiza) */}
                  <img
                    src={`/api/foto?ruta=${encodeURIComponent(g.foto_path)}`}
                    alt={`Comprobante del gasto de ${ETIQUETA_CATEGORIA[g.categoria]}`}
                    width={96}
                    height={96}
                    loading="lazy"
                    className="size-24 rounded-lg border-2 border-tinta object-cover"
                  />
                </a>
              )}

              {g.anulado ? (
                <p className="mt-1 text-base font-bold">Anulado: {g.anulado_motivo}</p>
              ) : (
                <Button variante="fantasma" className="mt-1 -ml-2" onClick={() => setAnulando({ id: g.id, monto: g.monto, categoria: ETIQUETA_CATEGORIA[g.categoria] })}>
                  <Undo2 className="size-5" aria-hidden /> Anular
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {anulando && (
        <HojaMotivo
          titulo="Anular gasto"
          descripcion={`Se anula el gasto de ${anulando.categoria} por ${formatearPesos(anulando.monto)}. No se borra: queda con el motivo.`}
          confirmar="Anular gasto"
          motivosRapidos={["Monto mal digitado", "Categoría equivocada", "Duplicado"]}
          onConfirmar={async (motivo) => {
            const r = await anularGasto(anulando.id, motivo);
            return r.ok ? null : r.error;
          }}
          onCerrar={() => setAnulando(null)}
        />
      )}
    </div>
  );
}
