import { Suspense } from "react";
import { Flame } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EntrarConDestino, FormularioEntrar } from "@/components/sesion/formulario-entrar";
import { MARCA } from "@/lib/marca";

/** Portada de la demo (estática: carga al instante). La tesis: tu día entero cabe en un tiquete. */
export default function Portada() {
  return (
    <div className="columna-app pb-accion flex flex-col px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="flex items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-lg border-2 border-tinta bg-sol shadow-sello-chico">
          <Flame className="size-6" strokeWidth={2.75} aria-hidden />
        </span>
        <span className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
          {MARCA.nombre}
        </span>
      </div>

      <h1 className="font-display mt-7 text-[2.75rem] font-extrabold uppercase leading-[0.95] tracking-tight">
        Sabe si ganaste hoy
      </h1>
      <p className="mt-3 max-w-[26ch] text-lg leading-snug text-tinta-2">
        Pedidos, cobro, fiado y gastos desde el celular. Cierras el día y se lo mandas por WhatsApp.
      </p>

      {/* Tiquete de ejemplo: la firma visual del producto. Cifras fijas de muestra. */}
      <section aria-label="Ejemplo de cierre del día" className="tiquete mt-7 border-2 border-b-0 border-tinta px-4 pt-4 pb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Cierre del día · ejemplo</p>
        <dl className="mt-3 space-y-2 text-lg">
          <div className="flex items-baseline justify-between">
            <dt>Ventas</dt>
            <dd className="cifra text-2xl">$ 1.284.500</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt>Gastos</dt>
            <dd className="cifra text-2xl">− $ 862.300</dd>
          </div>
        </dl>
        <hr className="separador-punteado my-3" />
        <div className="flex items-baseline justify-between">
          <p className="font-bold">Ganancia aprox.</p>
          <p className="cifra text-4xl">$ 422.200</p>
        </div>
      </section>

      <BarraAccion>
        <Suspense fallback={<FormularioEntrar />}>
          <EntrarConDestino />
        </Suspense>
      </BarraAccion>
    </div>
  );
}
