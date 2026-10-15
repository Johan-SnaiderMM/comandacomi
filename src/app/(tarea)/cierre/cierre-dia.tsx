"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Undo2 } from "lucide-react";
import { anularCierre, cerrarDia } from "@/app/acciones/cierre";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaMonto } from "@/components/ui/hoja-monto";
import { HojaMotivo } from "@/components/ui/hoja-motivo";
import { Input } from "@/components/ui/input";
import type { CierreDelDia } from "@/lib/datos/tipos";
import { describirDiferencia, diferenciaCaja, efectivoEsperado, formatearPesos } from "@/lib/dinero";
import { fechaCorta, fechaLarga, fechaRelativa, horaCorta, textoHoraCorte } from "@/lib/fechas";
import { enlaceWhatsapp, mensajeResumenCierre } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

const TONO = { ok: "bg-listo text-papel", falta: "bg-aji text-papel", sobra: "bg-sol text-tinta" } as const;

function Fila({ etiqueta, valor, fuerte, className }: { etiqueta: string; valor: string; fuerte?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", className)}>
      <dt className={cn("text-base", fuerte && "font-bold")}>{etiqueta}</dt>
      <dd className={cn("cifra", fuerte ? "text-3xl" : "text-xl")}>{valor}</dd>
    </div>
  );
}

/**
 * Cierre del día: ventas − gastos = ganancia aproximada, efectivo esperado contra el contado y el resumen por WhatsApp.
 * El día es el de TRABAJO: va hasta la hora de corte (4 a. m.), no hasta medianoche. Cerrarlo a mano lo termina antes:
 * lo que se registre después entra al día siguiente y estas cifras ya no se mueven.
 */
export function CierreDia({
  datos,
  fechaElegida = null,
  porCobrar,
  restaurante,
  horaCorte,
}: {
  datos: CierreDelDia;
  /** Un día anterior que quedó abierto (`/cierre?fecha=`); null = el día de trabajo. */
  fechaElegida?: string | null;
  /** Total que le deben al restaurante (fiado), para el resumen. */
  porCobrar: number;
  restaurante: string;
  /** Hora de Bogotá en que cambia el día de trabajo (4 si la base no la trae). */
  horaCorte?: number;
}) {
  const router = useRouter();
  const { resumen: r, cierre } = datos;
  const hoy = r.fecha;
  // Ya se cerró y todavía no llega la hora de corte: lo nuevo está entrando al día siguiente.
  const siguiente = !fechaElegida && cierre && datos.jornada && datos.jornada !== r.fecha ? datos.jornada : null;
  const [base, setBase] = useState(cierre?.base_caja ?? datos.cierres_recientes[0]?.base_caja ?? 0);
  const [contado, setContado] = useState<number | null>(cierre?.efectivo_contado ?? null);
  const [notas, setNotas] = useState("");
  const [hoja, setHoja] = useState<"base" | "contado" | "anular" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, empezar] = useTransition();

  // Lo que se muestra: si el día ya se cerró, las cifras congeladas; si no, las de ahora con la base elegida.
  const esperado = cierre ? cierre.efectivo_esperado : efectivoEsperado({ cobradoEfectivo: r.cobrado_efectivo, abonosEfectivo: r.abonos_efectivo, gastosCaja: r.gastos_caja }, base);
  const ventas = cierre ? cierre.ventas : r.ventas;
  const gastos = cierre ? cierre.gastos : r.gastos;
  const ganancia = cierre ? cierre.ganancia : r.ganancia;
  const contadoMostrado = cierre ? cierre.efectivo_contado : contado;
  const diferencia = contadoMostrado === null ? null : cierre ? cierre.diferencia : diferenciaCaja(contadoMostrado, esperado);
  const veredicto = diferencia === null ? null : describirDiferencia(diferencia);

  const enlace = enlaceWhatsapp({
    texto: mensajeResumenCierre({
      restaurante,
      fecha: fechaLarga(r.fecha),
      ventas,
      gastos,
      ganancia,
      porCobrar,
      efectivoEsperado: esperado,
      efectivoContado: contadoMostrado,
    }),
    sinNumero: true, // el dueño escoge a quién mandárselo (por ejemplo, a sí mismo)
  });

  function cerrar() {
    if (contado === null) return;
    setError(null);
    empezar(async () => {
      const res = await cerrarDia({ base, contado, notas, fecha: fechaElegida });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <EncabezadoPantalla titulo="Cierre del día" atras={fechaElegida ? "/cierre" : "/inicio"} />
      <main className="flex-1 space-y-3 px-4 pt-3 pb-[calc(var(--accion-h)+var(--seguro-abajo)+1rem)]">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">{fechaLarga(r.fecha)}</p>
          {!cierre &&
            (fechaElegida ? (
              <p className="text-base leading-snug text-tinta-2">Este día quedó abierto. Ciérralo con la base y el efectivo que había en la caja esa noche.</p>
            ) : (
              <p className="text-base leading-snug text-tinta-2">Cuenta lo vendido hasta las {textoHoraCorte(horaCorte)}, o hasta que lo cierres.</p>
            ))}
        </div>

        {/* Un día anterior con ventas que nadie cerró (pasó la hora de corte sin cierre): se ofrece cerrarlo. */}
        {!fechaElegida && datos.sin_cerrar && (
          <section role="status" aria-label="Día sin cerrar" className="rounded-2xl border-2 border-tinta bg-sol-suave p-3">
            <p className="text-lg font-bold leading-tight">El {fechaLarga(datos.sin_cerrar).toLowerCase()} quedó sin cerrar.</p>
            <p className="mt-0.5 text-base text-tinta-2">Ciérralo para que sus cuentas queden guardadas. Lo de hoy no se mueve.</p>
            <Link href={`/cierre?fecha=${datos.sin_cerrar}`} className={cn(botonVariantes({ variante: "secundario", bloque: true }), "mt-2")}>
              Cerrar ese día
            </Link>
          </section>
        )}

        {cierre && (
          <Aviso tipo="ok">
            Día cerrado ({horaCorta(cierre.created_at)}). Estas cifras quedaron guardadas.
            {siguiente && ` Lo que registres desde ahora cuenta para el ${fechaLarga(siguiente).toLowerCase()}.`}
          </Aviso>
        )}
        {cierre && fechaElegida && (
          <Link href="/cierre" className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
            Volver al día de hoy
          </Link>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}

        <section aria-label="Ventas, gastos y ganancia" className="tiquete border-2 border-b-0 border-tinta px-4 pt-3 pb-4">
          <dl className="space-y-1">
            <Fila etiqueta={`Ventas (${r.pedidos} ${r.pedidos === 1 ? "pedido" : "pedidos"})`} valor={formatearPesos(ventas)} />
            <Fila etiqueta="Gastos" valor={`− ${formatearPesos(gastos)}`} />
          </dl>
          <hr className="separador-punteado my-2" />
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold leading-tight">Ganancia aprox.</p>
            <p className={cn("cifra text-[2.75rem]", ganancia < 0 && "text-aji")}>{formatearPesos(ganancia)}</p>
          </div>
          {r.fiado_nuevo > 0 && !cierre && (
            <p className="mt-1 text-base text-tinta-2">Incluye {formatearPesos(r.fiado_nuevo)} que quedaron fiados {fechaElegida ? "ese día" : "hoy"} (aún no entran a la caja).</p>
          )}
        </section>

        <section aria-label="Efectivo de la caja" className="rounded-2xl border-2 border-tinta bg-papel p-3">
          <h2 className="font-display mb-1 text-2xl font-extrabold uppercase leading-none">Efectivo de la caja</h2>
          <dl className="space-y-0.5">
            {cierre ? (
              <Fila etiqueta="Base de la caja" valor={formatearPesos(cierre.base_caja)} />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-base">Base de la caja</dt>
                <dd>
                  <button
                    type="button"
                    onClick={() => setHoja("base")}
                    className="flex min-h-12 items-center gap-1.5 rounded-xl border-2 border-tinta bg-papel px-3 shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none"
                  >
                    <span className="cifra text-xl">{formatearPesos(base)}</span>
                    <Pencil className="size-4" aria-label="Cambiar" />
                  </button>
                </dd>
              </div>
            )}
            {!cierre && (
              <>
                <Fila etiqueta="+ Efectivo cobrado" valor={formatearPesos(r.cobrado_efectivo)} className="text-tinta-2" />
                <Fila etiqueta="+ Abonos en efectivo" valor={formatearPesos(r.abonos_efectivo)} className="text-tinta-2" />
                <Fila etiqueta="− Gastos de la caja" valor={formatearPesos(r.gastos_caja)} className="text-tinta-2" />
              </>
            )}
          </dl>
          <hr className="separador-punteado my-2" />
          <dl>
            <Fila etiqueta="Debería haber" valor={formatearPesos(esperado)} fuerte />
          </dl>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-base font-bold">Contaste</p>
            {cierre ? (
              <p className="cifra text-3xl">{formatearPesos(cierre.efectivo_contado)}</p>
            ) : (
              <button
                type="button"
                onClick={() => setHoja("contado")}
                className={cn(
                  "flex min-h-14 items-center gap-2 rounded-xl border-2 border-tinta px-3 shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none",
                  contado === null ? "bg-sol" : "bg-papel"
                )}
              >
                <span className="cifra text-3xl">{contado === null ? "Contar efectivo" : formatearPesos(contado)}</span>
                {contado !== null && <Pencil className="size-4" aria-label="Cambiar" />}
              </button>
            )}
          </div>

          {veredicto && (
            <p role="status" className={cn("mt-3 rounded-xl border-2 border-tinta px-3 py-2 text-center text-lg font-extrabold", TONO[veredicto.tono])}>
              {veredicto.texto}
            </p>
          )}
        </section>

        {!cierre && (
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} placeholder="Nota del día (opcional)" aria-label="Nota del cierre" />
        )}

        <a href={enlace} target="_blank" rel="noopener noreferrer" className={botonVariantes({ variante: cierre ? "primario" : "secundario", tamano: "lg", bloque: true })}>
          <MessageCircle className="size-5" aria-hidden /> Enviar resumen por WhatsApp
        </a>

        {cierre && (
          <Button variante="fantasma" bloque onClick={() => setHoja("anular")}>
            <Undo2 className="size-5" aria-hidden /> Anular cierre
          </Button>
        )}

        {datos.cierres_recientes.length > 0 && (
          <section aria-label="Cierres anteriores">
            <h2 className="font-display mb-1 mt-2 text-2xl font-extrabold uppercase leading-none">Cierres anteriores</h2>
            <ul className="divide-y-2 divide-dashed divide-tinta/30 rounded-xl border-2 border-tinta bg-papel">
              {datos.cierres_recientes
                .filter((c) => c.fecha !== r.fecha)
                .map((c) => {
                  const d = describirDiferencia(c.diferencia);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="block text-base font-bold">{fechaRelativa(c.fecha, hoy)}</span>
                        <span className="block text-base text-tinta-2">{fechaCorta(c.fecha)} · {d.texto}</span>
                      </span>
                      <span className="cifra text-2xl">{formatearPesos(c.ganancia)}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
        )}
      </main>

      {!cierre && (
        <BarraAccion>
          <Button tamano="lg" bloque variante="exito" disabled={contado === null || cerrando} onClick={cerrar}>
            {cerrando ? "Cerrando…" : contado === null ? "Cuenta el efectivo para cerrar" : "Cerrar el día"}
          </Button>
        </BarraAccion>
      )}

      {hoja === "base" && (
        <HojaMonto titulo="Base de la caja" ayuda={`Con cuánto efectivo abriste la caja ${fechaElegida ? "ese día" : "hoy"}.`} inicial={base} onElegir={(v) => { setBase(v); setHoja(null); }} onCerrar={() => setHoja(null)} />
      )}
      {hoja === "contado" && (
        <HojaMonto
          titulo="Efectivo contado"
          ayuda={`Cuenta los billetes y monedas de la caja. Deberías tener ${formatearPesos(esperado)}.`}
          inicial={contado ?? 0}
          confirmar="Listo"
          onElegir={(v) => { setContado(v); setHoja(null); }}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "anular" && cierre && (
        <HojaMotivo
          titulo="Anular cierre"
          descripcion="El día vuelve a quedar abierto para cerrarlo de nuevo, con lo que se haya registrado después incluido. Este cierre queda registrado con el motivo."
          confirmar="Anular cierre"
          motivosRapidos={["Conté mal la caja", "Faltaba registrar algo", "Base equivocada"]}
          onConfirmar={async (motivo) => {
            const res = await anularCierre(cierre.id, motivo);
            if (res.ok) {
              setContado(null);
              router.refresh();
            }
            return res.ok ? null : res.error;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}
