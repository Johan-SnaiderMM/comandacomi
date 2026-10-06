import Link from "next/link";
import { ChevronRight, Lightbulb, MessageCircle, ReceiptText, UtensilsCrossed, Wallet, type LucideIcon } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { BotonGuia } from "@/components/guia/boton-guia";
import { BotonReiniciar } from "@/components/sesion/boton-reiniciar";
import { BotonSalir } from "@/components/sesion/boton-salir";
import { obtenerContexto } from "@/lib/datos/inicio";
import { MARCA } from "@/lib/marca";

export const metadata = { title: "Más" };

const fila =
  "flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-tinta bg-papel px-4 py-2 text-lg font-bold shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none";

function Enlace({ href, Icono, titulo, detalle }: { href: string; Icono: LucideIcon; titulo: string; detalle: string }) {
  return (
    <Link href={href} className={fila}>
      <Icono className="size-6 shrink-0" aria-hidden />
      <span className="flex-1 leading-tight">
        {titulo}
        <span className="block text-sm font-normal text-tinta-2">{detalle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}

export default async function Mas() {
  const contexto = await obtenerContexto();
  const textoContacto = encodeURIComponent(`Hola, vi la demo de ${MARCA.nombre} y quiero esta app para mi restaurante.`);

  return (
    <>
      <EncabezadoPantalla titulo="Más" />
      <main className="pb-nav space-y-3 px-4 pt-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">
          {contexto.restaurante?.nombre} · {contexto.perfil?.nombre}
        </p>
        {contexto.restaurante?.es_demo && (
          <BotonGuia className={`${fila} bg-sol`}>
            <Lightbulb className="size-6 shrink-0" aria-hidden />
            <span className="flex-1 text-left leading-tight">
              Recorrido guiado
              <span className="block text-sm font-normal">Paso a paso: pedido, cobro, fiado y cierre</span>
            </span>
          </BotonGuia>
        )}
        <Enlace href="/gastos" Icono={Wallet} titulo="Gastos del día" detalle="Carne, pan, gas, domiciliario…" />
        <Enlace href="/cierre" Icono={ReceiptText} titulo="Cierre del día" detalle="Ventas, gastos y efectivo de la caja" />
        <Enlace href="/menu" Icono={UtensilsCrossed} titulo="Menú" detalle="Platos, precios y disponibilidad" />
        {MARCA.contactoWhatsapp && (
          <a
            href={`https://wa.me/${MARCA.contactoWhatsapp}?text=${textoContacto}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${fila} bg-sol`}
          >
            <MessageCircle className="size-6 shrink-0" aria-hidden />
            <span className="flex-1 leading-tight">
              Quiero esta app
              <span className="block text-sm font-normal">Escríbenos por WhatsApp</span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden />
          </a>
        )}
        <div className="space-y-3 pt-3">
          {contexto.restaurante?.es_demo && contexto.perfil?.rol === "dueno" && <BotonReiniciar className={fila} nombreActual={contexto.restaurante.nombre} />}
          <BotonSalir className={`${fila} text-tinta-2`} />
        </div>
      </main>
    </>
  );
}
