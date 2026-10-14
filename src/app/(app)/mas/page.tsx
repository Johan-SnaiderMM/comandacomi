import Link from "next/link";
import { Armchair, ChefHat, ChevronRight, Eye, Lightbulb, MessageCircle, NotebookPen, ReceiptText, UsersRound, UtensilsCrossed, Wallet, type LucideIcon } from "lucide-react";
import { dejarDeVerComo } from "@/app/acciones/equipo";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { AvisosDelCelular } from "@/components/avisos/avisos-del-celular";
import { SelectorVerComo } from "@/components/equipo/selector-ver-como";
import { BotonGuia } from "@/components/guia/boton-guia";
import { BotonReiniciar } from "@/components/sesion/boton-reiniciar";
import { BotonSalir } from "@/components/sesion/boton-salir";
import { abre, puedeVer } from "@/lib/areas";
import { listarEquipo } from "@/lib/datos/equipo";
import { MARCA } from "@/lib/marca";
import { obtenerQuien } from "@/lib/permisos";
import { AREA_DEL_CANAL, CANALES_PERSONAL } from "@/lib/push/tipos";

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

/** Más: lo que no cabe en la barra de abajo. Cada quien ve solo lo que su rol abre (el dueño, todo). */
export default async function Mas() {
  const { contexto, quien } = await obtenerQuien();
  const roles = quien.viendoComo ? [quien.viendoComo] : (contexto.perfil?.roles ?? []);
  const canales = CANALES_PERSONAL.filter((c) => abre(quien, AREA_DEL_CANAL[c]));
  // "Ver la app como…": los roles del local (si la base todavía no los tiene, simplemente no aparece).
  const rolesDelLocal = quien.esDueno ? ((await listarEquipo().catch(() => null))?.roles ?? []) : [];
  const textoContacto = encodeURIComponent(`Hola, vi la demo de ${MARCA.nombre} y quiero esta app para mi restaurante.`);

  return (
    <>
      <EncabezadoPantalla titulo="Más" />
      <main className="pb-nav space-y-3 px-4 pt-4">
        <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">
          {contexto.restaurante?.nombre} · {contexto.perfil?.nombre}
          {!quien.esDueno && roles.length > 0 && ` · ${roles.join(", ")}`}
        </p>
        {quien.viendoComo && (
          <form action={dejarDeVerComo}>
            <button type="submit" className={`${fila} bg-sol`}>
              <Eye className="size-6 shrink-0" aria-hidden />
              <span className="flex-1 text-left leading-tight">
                Volver a ver como dueño
                <span className="block text-sm font-normal">Ahora la ves como {quien.viendoComo}</span>
              </span>
            </button>
          </form>
        )}
        {contexto.restaurante?.es_demo && quien.esDueno && (
          <BotonGuia className={`${fila} bg-sol`}>
            <Lightbulb className="size-6 shrink-0" aria-hidden />
            <span className="flex-1 text-left leading-tight">
              Recorrido guiado
              <span className="block text-sm font-normal">Paso a paso: pedido, cobro, fiado y cierre</span>
            </span>
          </BotonGuia>
        )}
        {puedeVer(quien, "plancha") && <Enlace href="/plancha" Icono={ChefHat} titulo="Plancha" detalle="Lo que hay que cocinar, plato por plato" />}
        {puedeVer(quien, "fiado") && <Enlace href="/fiado" Icono={NotebookPen} titulo="Fiado" detalle="Quién debe, abonos y recordatorios por WhatsApp" />}
        {canales.length > 0 && <AvisosDelCelular canales={canales} />}
        {puedeVer(quien, "gastos") && <Enlace href="/gastos" Icono={Wallet} titulo="Gastos del día" detalle="Carne, pan, gas, domiciliario…" />}
        {puedeVer(quien, "cierre") && <Enlace href="/cierre" Icono={ReceiptText} titulo="Cierre del día" detalle="Ventas, gastos y efectivo de la caja" />}
        {puedeVer(quien, "menu") && (
          <Enlace
            href="/menu"
            Icono={UtensilsCrossed}
            titulo="Menú"
            detalle={quien.esDueno ? "Platos, precios, adiciones y disponibilidad" : "Marcar los platos que se acabaron"}
          />
        )}
        {puedeVer(quien, "mesas") && <Enlace href="/mesas" Icono={Armchair} titulo="Mesas" detalle="Agregar, cambiar el nombre o quitar" />}
        {puedeVer(quien, "equipo") && <Enlace href="/equipo" Icono={UsersRound} titulo="Equipo y permisos" detalle="Quién toma pedidos, cobra, cocina…" />}
        {quien.esDueno && rolesDelLocal.length > 0 && <SelectorVerComo roles={rolesDelLocal} className={fila} />}
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
          {contexto.restaurante?.es_demo && quien.esDueno && (
            <BotonReiniciar className={fila} nombreActual={contexto.restaurante.nombre} conPin={contexto.restaurante.reinicio_con_pin === true} />
          )}
          <BotonSalir className={`${fila} text-tinta-2`} conCodigo={contexto.perfil?.rol === "ayudante"} />
        </div>
      </main>
    </>
  );
}
