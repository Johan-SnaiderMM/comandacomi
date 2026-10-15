import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { ocultarPrimerosPasos } from "@/app/acciones/inicio";
import { botonVariantes } from "@/components/ui/button";
import { pasosDe, type DatosPrimerosPasos } from "@/lib/primeros-pasos";
import { cn } from "@/lib/utils";

/**
 * Inicio de un local nuevo (solo el dueño de un restaurante de verdad): qué hacer primero, en orden. Cada paso lleva a
 * su pantalla y se marca solo con lo que ya hay. Se va cuando todo está hecho, o con "Ya no mostrar".
 */
export function PrimerosPasos({ datos }: { datos: DatosPrimerosPasos }) {
  const pasos = pasosDe(datos);
  const hechos = pasos.filter((p) => p.hecho).length;

  return (
    <section aria-labelledby="titulo-primeros-pasos" className="rounded-2xl border-2 border-tinta bg-sol-suave p-3 shadow-sello">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titulo-primeros-pasos" className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
          Primeros pasos
        </h2>
        <span className="text-base font-bold text-tinta-2">
          {hechos} de {pasos.length}
        </span>
      </div>
      <p className="mt-1 text-base leading-snug text-tinta-2">Para dejar tu local listo. Cada paso se marca solo cuando lo haces.</p>

      <ol className="mt-3 space-y-2">
        {pasos.map((p, i) => (
          <li key={p.clave}>
            <Link
              href={p.href}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 active:translate-y-[2px] active:shadow-none",
                p.hecho ? "border-tinta/40 bg-papel" : "border-tinta bg-papel shadow-sello-chico"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "cifra flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-tinta text-lg",
                  p.hecho ? "bg-listo text-papel" : "bg-sol"
                )}
              >
                {p.hecho ? <Check className="size-5" strokeWidth={3.5} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-base font-bold">
                  {p.titulo}
                  <span className="sr-only">{p.hecho ? " (hecho)" : " (falta)"}</span>
                </span>
                <span className="block text-base text-tinta-2">{p.detalle}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-tinta-2" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>

      <form action={ocultarPrimerosPasos} className="mt-2">
        <button type="submit" className={botonVariantes({ variante: "fantasma", bloque: true })}>
          Ya no mostrar
        </button>
      </form>
    </section>
  );
}
