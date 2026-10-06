import Link from "next/link";
import { ClipboardList, NotebookPen, ReceiptText, Wallet } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { AvisoUrl } from "@/components/ui/aviso-url";
import { botonVariantes } from "@/components/ui/button";
import { obtenerContexto, obtenerInicio } from "@/lib/datos/inicio";
import { formatearPesos } from "@/lib/dinero";
import { fechaLarga } from "@/lib/fechas";
import { veredictoDelDia } from "@/lib/inicio";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inicio" };

const tarjeta =
  "block rounded-2xl border-2 border-tinta p-4 shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none";

export default async function Inicio({ searchParams }: PageProps<"/inicio">) {
  const sp = await searchParams;
  const [inicio, contexto] = await Promise.all([obtenerInicio(), obtenerContexto()]);
  const veredicto = veredictoDelDia(inicio.ventas_hoy, inicio.gastos_hoy);

  return (
    <>
      <EncabezadoPantalla
        titulo="Inicio"
        derecha={
          contexto.restaurante?.es_demo ? (
            <span className="mr-2 rounded-full border-2 border-tinta bg-sol px-2.5 py-0.5 text-sm font-bold">Demo</span>
          ) : null
        }
      />
      <main className="pb-nav space-y-3 px-4 pt-3">
        {sp.reiniciada === "1" && <AvisoUrl>Demo reiniciada: los datos de ejemplo están como nuevos.</AvisoUrl>}
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">{fechaLarga(inicio.fecha)}</p>
          <h2
            className={cn(
              "font-display text-4xl font-extrabold uppercase leading-none tracking-tight",
              veredicto.tono === "alerta" && "text-aji",
              veredicto.tono === "bien" && "text-listo"
            )}
          >
            {veredicto.titulo}
          </h2>
          <p className="mt-0.5 text-base leading-snug text-tinta-2">{veredicto.detalle}</p>
        </div>

        {/* El día en un tiquete: ventas − gastos = ganancia aproximada */}
        <section aria-label="Resumen de hoy" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
          <p className="flex items-baseline justify-between text-sm font-bold uppercase tracking-wide text-tinta-2">
            <span>Ventas de hoy</span>
            <span className="font-normal normal-case tracking-normal">
              {inicio.pedidos_hoy} {inicio.pedidos_hoy === 1 ? "pedido" : "pedidos"}
            </span>
          </p>
          <p className="cifra text-[3rem]">{formatearPesos(inicio.ventas_hoy)}</p>
          <div className="mt-2 flex items-baseline justify-between text-lg">
            <span>Gastos</span>
            <span className="cifra text-2xl">− {formatearPesos(inicio.gastos_hoy)}</span>
          </div>
          <hr className="separador-punteado my-2" />
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold leading-tight">Ganancia aprox.</p>
            <p className={cn("cifra text-4xl", inicio.ganancia_hoy < 0 && "text-aji")}>{formatearPesos(inicio.ganancia_hoy)}</p>
          </div>
        </section>
        <p className="text-center text-sm leading-tight text-tinta-2">
          Ayer vendiste {formatearPesos(inicio.ventas_ayer)} y ganaste {formatearPesos(inicio.ganancia_ayer)}.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/fiado" className={cn(tarjeta, "bg-papel")}>
            <p className="flex items-center gap-1.5 text-sm font-bold uppercase leading-tight tracking-wide text-tinta-2">
              <NotebookPen className="size-4 shrink-0" aria-hidden /> Por cobrar
            </p>
            <p className={cn("cifra mt-2 text-[2rem]", inicio.por_cobrar > 0 && "text-aji")}>{formatearPesos(inicio.por_cobrar)}</p>
            <p className="mt-1 text-sm text-tinta-2">
              {inicio.clientes_con_deuda === 0
                ? "Nadie debe nada"
                : `${inicio.clientes_con_deuda} ${inicio.clientes_con_deuda === 1 ? "cliente debe" : "clientes deben"}`}
            </p>
          </Link>
          <Link href="/pedidos" className={cn(tarjeta, "bg-sol")}>
            <p className="flex items-center gap-1.5 text-sm font-bold uppercase leading-tight tracking-wide">
              <ClipboardList className="size-4 shrink-0" aria-hidden /> Pendientes
            </p>
            <p className="cifra mt-2 text-[2rem]">{inicio.pedidos_pendientes}</p>
            <p className="mt-1 text-sm">
              {inicio.pedidos_pendientes === 0
                ? "Todo al día"
                : inicio.pedidos_sin_cobrar === 0
                  ? "Todos cobrados"
                  : `${inicio.pedidos_sin_cobrar} por cobrar`}
            </p>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Link href="/gastos" className={botonVariantes({ variante: "secundario", tamano: "lg" })}>
            <Wallet className="size-5" aria-hidden /> Gasto
          </Link>
          <Link href="/cierre" className={botonVariantes({ variante: "secundario", tamano: "lg" })}>
            <ReceiptText className="size-5" aria-hidden /> Cierre del día
          </Link>
        </div>
      </main>
    </>
  );
}
