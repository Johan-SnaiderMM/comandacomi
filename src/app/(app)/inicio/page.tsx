import Link from "next/link";
import { ChefHat, ClipboardList, Lightbulb, Lock, NotebookPen, ReceiptText, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { BotonGuia } from "@/components/guia/boton-guia";
import { AvisoUrl } from "@/components/ui/aviso-url";
import { botonVariantes } from "@/components/ui/button";
import { puedeVer, quienEs } from "@/lib/areas";
import { obtenerContexto, obtenerInicio } from "@/lib/datos/inicio";
import { formatearPesos } from "@/lib/dinero";
import { fechaLarga } from "@/lib/fechas";
import { cifrasDelDia, resumenDeInicio, veredictoDelDia, type CifrasDeInicio } from "@/lib/inicio";
import { nombreCorto } from "@/lib/nombres";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inicio" };

const tarjeta =
  "block rounded-2xl border-2 border-tinta p-4 shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none";

/** El día en un tiquete (ventas − gastos = ganancia aproximada), para quien ve las cuentas. */
function CuentasDelDia({ cifras, jornada }: { cifras: CifrasDeInicio; jornada: string }) {
  // "Hoy" es el día de trabajo: cambia a la hora de corte (4 a. m.) o cuando el dueño lo cierra, no a medianoche.
  const diaCerrado = cifras.jornada_adelantada === true;
  const veredicto = veredictoDelDia(cifras.ventas_hoy, cifras.gastos_hoy, diaCerrado);
  // Recién cerrado (antes de la hora de corte) y sin nada nuevo: el tiquete muestra cómo quedó ESE día, no ceros.
  const resumen = resumenDeInicio(cifras);

  return (
    <>
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
          {resumen.cerrado ? `Así quedó. Lo que registres desde ahora cuenta para el ${fechaLarga(jornada).toLowerCase()}.` : veredicto.detalle}
        </p>
        {diaCerrado && !resumen.cerrado && (
          <p className="mt-0.5 text-base leading-snug text-tinta-2">Ya cerraste el día anterior: esto cuenta para el siguiente.</p>
        )}
      </div>

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
          Ayer vendiste {formatearPesos(cifras.ventas_ayer)} y ganaste {formatearPesos(cifras.ganancia_ayer)}.
        </p>
      )}
    </>
  );
}

/** Lo que deben los clientes. Lleva al fiado solo a quien lo puede abrir (quien ve las cuentas también ve la cifra). */
function PorCobrar({ monto, deudores, abreFiado }: { monto: number; deudores: number; abreFiado: boolean }) {
  const contenido = (
    <>
      <p className="flex items-center gap-1.5 text-sm font-bold uppercase leading-tight tracking-wide text-tinta-2">
        <NotebookPen className="size-4 shrink-0" aria-hidden /> Por cobrar
      </p>
      <p className={cn("cifra mt-2 text-[2rem]", monto > 0 && "text-aji")}>{formatearPesos(monto)}</p>
      <p className="mt-1 text-sm text-tinta-2">{deudores === 0 ? "Nadie debe nada" : `${deudores} ${deudores === 1 ? "cliente debe" : "clientes deben"}`}</p>
    </>
  );
  return abreFiado ? (
    <Link href="/fiado" className={cn(tarjeta, "bg-papel")}>
      {contenido}
    </Link>
  ) : (
    <div className="rounded-2xl border-2 border-tinta bg-papel p-4">{contenido}</div>
  );
}

type Acceso = { href: string; Icono: LucideIcon; texto: string; insignia?: number };

/**
 * Inicio. Quien ve las cuentas del día (el dueño, o un rol con "Cuentas del día") empieza por "¿voy ganando hoy?";
 * el resto del equipo ve su trabajo: los pendientes y los accesos a lo que su rol abre.
 */
export default async function Inicio({ searchParams }: PageProps<"/inicio">) {
  const sp = await searchParams;
  const [inicio, contexto] = await Promise.all([obtenerInicio(), obtenerContexto()]);
  const quien = quienEs(contexto);
  const cifras = cifrasDelDia(inicio);
  const roles = contexto.perfil?.roles ?? [];

  const verFiado = puedeVer(quien, "fiado");
  const verPendientes = puedeVer(quien, "pendientes");
  const accesos = [
    puedeVer(quien, "plancha") && { href: "/plancha", Icono: ChefHat, texto: "Plancha" },
    puedeVer(quien, "enLinea") && { href: "/pedidos-en-linea", Icono: Smartphone, texto: "En línea", insignia: inicio.pedidos_por_confirmar },
    puedeVer(quien, "gastos") && { href: "/gastos", Icono: Wallet, texto: "Gasto" },
    puedeVer(quien, "cierre") && { href: "/cierre", Icono: ReceiptText, texto: "Cierre del día" },
  ].filter((a): a is Acceso => Boolean(a));
  const tarjetas = (inicio.por_cobrar !== null ? 1 : 0) + (verPendientes ? 1 : 0);

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
        {/* El recorrido pasa por pedido, cobro, fiado y cierre: es para el dueño (en la demo, quien la muestra). */}
        {contexto.restaurante?.es_demo && quien.esDueno && (
          <BotonGuia className={botonVariantes({ variante: "primario", tamano: "lg", bloque: true })}>
            <Lightbulb className="size-5" aria-hidden /> Recorrido guiado · 2 minutos
          </BotonGuia>
        )}
        {sp.reiniciada === "1" && <AvisoUrl>Demo reiniciada: los datos de ejemplo están como nuevos.</AvisoUrl>}

        {cifras ? (
          <CuentasDelDia cifras={cifras} jornada={inicio.fecha} />
        ) : (
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">{fechaLarga(inicio.fecha)}</p>
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight">
              Hola{contexto.perfil?.nombre ? `, ${nombreCorto(contexto.perfil.nombre)}` : ""}
            </h2>
            {roles.length > 0 && <p className="mt-0.5 text-base leading-snug text-tinta-2">Tu rol: {roles.join(" y ")}.</p>}
          </div>
        )}

        {quien.areas.length === 0 && (
          <section aria-label="Sin permisos" className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-tinta/50 p-4">
            <Lock className="mt-0.5 size-6 shrink-0" aria-hidden />
            <p className="text-lg leading-snug">
              Todavía no tienes permisos. Pídele al dueño que te asigne un rol en <strong>Más → Equipo</strong>.
            </p>
          </section>
        )}

        {tarjetas > 0 && (
          <div className={cn("grid gap-3", tarjetas === 2 && "grid-cols-2")}>
            {inicio.por_cobrar !== null && <PorCobrar monto={inicio.por_cobrar} deudores={inicio.clientes_con_deuda ?? 0} abreFiado={verFiado} />}
            {verPendientes && (
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
            )}
          </div>
        )}

        {accesos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            {accesos.map(({ href, Icono, texto, insignia }, i) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  botonVariantes({ variante: accesos.length === 1 ? "primario" : "secundario", tamano: "lg" }),
                  "relative",
                  // Si quedan impares, el último ocupa la fila entera (no queda un hueco).
                  accesos.length % 2 === 1 && i === accesos.length - 1 && "col-span-2"
                )}
              >
                <Icono className="size-5" aria-hidden /> {texto}
                {(insignia ?? 0) > 0 && (
                  <span className="cifra absolute -right-1.5 -top-2 flex min-h-7 min-w-7 items-center justify-center rounded-full border-2 border-tinta bg-aji px-1.5 text-base text-papel">
                    {insignia}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
