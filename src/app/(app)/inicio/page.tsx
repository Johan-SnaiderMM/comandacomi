import Link from "next/link";
import { ChefHat, ClipboardList, Lightbulb, NotebookPen, ReceiptText, Smartphone, Wallet } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { BotonGuia } from "@/components/guia/boton-guia";
import { AvisoUrl } from "@/components/ui/aviso-url";
import { botonVariantes } from "@/components/ui/button";
import { obtenerContexto, obtenerInicio } from "@/lib/datos/inicio";
import { formatearPesos } from "@/lib/dinero";
import { fechaLarga } from "@/lib/fechas";
import { resumenDeInicio, veredictoDelDia } from "@/lib/inicio";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inicio" };

const tarjeta =
  "block rounded-2xl border-2 border-tinta p-4 shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none";

export default async function Inicio({ searchParams }: PageProps<"/inicio">) {
  const sp = await searchParams;
  const [inicio, contexto] = await Promise.all([obtenerInicio(), obtenerContexto()]);
  // "Hoy" es el día de trabajo: cambia a la hora de corte (4 a. m.) o cuando el dueño lo cierra, no a medianoche.
  const diaCerrado = inicio.jornada_adelantada === true;
  const veredicto = veredictoDelDia(inicio.ventas_hoy, inicio.gastos_hoy, diaCerrado);
  // Recién cerrado (antes de la hora de corte) y sin nada nuevo: el tiquete muestra cómo quedó ESE día, no ceros.
  const resumen = resumenDeInicio(inicio);

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
        {contexto.restaurante?.es_demo && (
          <BotonGuia className={botonVariantes({ variante: "primario", tamano: "lg", bloque: true })}>
            <Lightbulb className="size-5" aria-hidden /> Recorrido guiado · 2 minutos
          </BotonGuia>
        )}
        {sp.reiniciada === "1" && <AvisoUrl>Demo reiniciada: los datos de ejemplo están como nuevos.</AvisoUrl>}
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">{fechaLarga(resumen.fecha)}</p>
          <h2
            className={cn(
              "font-display text-4xl font-extrabold uppercase leading-none tracking-tight",
              veredicto.tono === "alerta" && "text-aji",
              veredicto.tono === "bien" && "text-listo"
            )}
          >
            {veredicto.titulo}
          </h2>
          <p className="mt-0.5 text-base leading-snug text-tinta-2">
            {resumen.cerrado ? `Así quedó. Lo que registres desde ahora cuenta para el ${fechaLarga(inicio.fecha).toLowerCase()}.` : veredicto.detalle}
          </p>
          {diaCerrado && !resumen.cerrado && (
            <p className="mt-0.5 text-base leading-snug text-tinta-2">Ya cerraste el día anterior: esto cuenta para el siguiente.</p>
          )}
        </div>

        {/* El día en un tiquete: ventas − gastos = ganancia aproximada */}
        <section aria-label={resumen.cerrado ? "Resumen del día cerrado" : "Resumen de hoy"} data-guia="resumen" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
          <p className="flex items-baseline justify-between text-sm font-bold uppercase tracking-wide text-tinta-2">
            <span>{resumen.cerrado ? "Ventas del día" : "Ventas de hoy"}</span>
            {resumen.pedidos !== null && (
              <span className="font-normal normal-case tracking-normal">
                {resumen.pedidos} {resumen.pedidos === 1 ? "pedido" : "pedidos"}
              </span>
            )}
          </p>
          <p className="cifra text-[3rem]">{formatearPesos(resumen.ventas)}</p>
          <div className="mt-2 flex items-baseline justify-between text-lg">
            <span>Gastos</span>
            <span className="cifra text-2xl">− {formatearPesos(resumen.gastos)}</span>
          </div>
          <hr className="separador-punteado my-2" />
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold leading-tight">Ganancia aprox.</p>
            <p className={cn("cifra text-4xl", resumen.ganancia < 0 && "text-aji")}>{formatearPesos(resumen.ganancia)}</p>
          </div>
        </section>
        {resumen.cerrado ? (
          <Link href="/cierre" className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
            <ReceiptText className="size-5" aria-hidden /> Ver el cierre del día
          </Link>
        ) : (
          <p className="text-center text-sm leading-tight text-tinta-2">
            Ayer vendiste {formatearPesos(inicio.ventas_ayer)} y ganaste {formatearPesos(inicio.ganancia_ayer)}.
          </p>
        )}

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
          <Link href="/plancha" className={botonVariantes({ variante: "secundario", tamano: "lg" })}>
            <ChefHat className="size-5" aria-hidden /> Plancha
          </Link>
          <Link href="/pedidos-en-linea" className={cn(botonVariantes({ variante: "secundario", tamano: "lg" }), "relative")}>
            <Smartphone className="size-5" aria-hidden /> En línea
            {(inicio.pedidos_por_confirmar ?? 0) > 0 && (
              <span className="cifra absolute -right-1.5 -top-2 flex min-h-7 min-w-7 items-center justify-center rounded-full border-2 border-tinta bg-aji px-1.5 text-base text-papel">
                {inicio.pedidos_por_confirmar}
              </span>
            )}
          </Link>
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
