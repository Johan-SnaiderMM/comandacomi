import Link from "next/link";
import { Check } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { botonVariantes } from "@/components/ui/button";
import { ETIQUETA_MEDIO, formatearPesos } from "@/lib/dinero";
import type { Resultado } from "./cobrar";

/**
 * Confirmación del cobro. Lo que más importa en el mostrador es el VUELTO, por eso va enorme:
 * se ve de reojo, sin leer. Se queda en pantalla hasta que se toque "Listo".
 */
export function Confirmacion({ resultado: r }: { resultado: Resultado }) {
  const nuevoSaldo = r.cliente ? r.cliente.saldo + r.fiado : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col items-start justify-center gap-4 px-4 pb-accion">
        <span className="flex size-16 items-center justify-center rounded-full border-2 border-tinta bg-listo text-papel shadow-sello">
          <Check className="size-9" strokeWidth={4} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Pedido #{r.numero}</p>
          <h1 className="font-display text-5xl font-extrabold uppercase leading-none">Cobrado</h1>
        </div>

        {r.vuelto > 0 && (
          <div className="w-full rounded-2xl border-2 border-tinta bg-sol p-4 shadow-sello">
            <p className="text-sm font-bold uppercase tracking-wide">Entrega de vuelto</p>
            <p className="cifra text-[4rem]">{formatearPesos(r.vuelto)}</p>
          </div>
        )}

        <section aria-label="Resumen del cobro" className="tiquete w-full border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
          <dl className="space-y-1.5 text-lg">
            <div className="flex justify-between">
              <dt>Cuenta</dt>
              <dd className="cifra text-2xl">{formatearPesos(r.total)}</dd>
            </div>
            {r.propina > 0 && (
              <div className="flex justify-between">
                <dt>Propina</dt>
                <dd className="cifra text-2xl">{formatearPesos(r.propina)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Pago</dt>
              <dd className="text-right font-bold">
                {r.medio === "fiado" && r.pagadoAhora > 0 ? `Efectivo + ${ETIQUETA_MEDIO.fiado}` : ETIQUETA_MEDIO[r.medio]}
              </dd>
            </div>
          </dl>
          {r.fiado > 0 && r.cliente && (
            <>
              <hr className="separador-punteado my-3" />
              <p className="text-base">
                Se anotaron <strong>{formatearPesos(r.fiado)}</strong> a <strong>{r.cliente.nombre}</strong>. Ahora debe{" "}
                <strong className="text-aji">{formatearPesos(nuevoSaldo)}</strong>.
              </p>
            </>
          )}
        </section>
      </main>

      <BarraAccion className="flex gap-2">
        <Link href="/pedido/nuevo" className={botonVariantes({ variante: "secundario", tamano: "lg", className: "flex-1" })}>
          Otro pedido
        </Link>
        <Link href="/pedidos" className={botonVariantes({ variante: "primario", tamano: "lg", className: "flex-1" })}>
          Listo
        </Link>
      </BarraAccion>
    </div>
  );
}
