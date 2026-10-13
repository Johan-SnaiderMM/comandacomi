"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, MapPin, MessageCircle, Phone, ShoppingBag } from "lucide-react";
import { aceptarPedidoCliente, rechazarPedidoCliente } from "@/app/acciones/clientes";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { HojaMotivo } from "@/components/ui/hoja-motivo";
import type { PedidoPorConfirmar } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { formatearTelefono } from "@/lib/telefono";
import { enlaceWhatsapp, mensajeAlClienteEnLinea } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Espera } from "./espera";

const TIEMPOS = [10, 15, 20, 30, 45];

/** Avisa al resto de la app (el aviso de arriba) que algo cambió para que se actualice al instante. */
function avisarCambio() {
  window.dispatchEvent(new Event("clientes:cambio"));
}

/**
 * Pedidos que hicieron clientes en línea y esperan al restaurante. Van arriba de todo, grandes y de colores fuertes:
 * lo primero que hay que hacer es aceptarlos (con un tiempo estimado que verá el cliente) o rechazarlos con motivo.
 */
export function PedidosPorConfirmar({ pedidos, ahora, restaurante }: { pedidos: PedidoPorConfirmar[]; ahora: string; restaurante: string }) {
  const router = useRouter();
  const [aceptando, setAceptando] = useState<PedidoPorConfirmar | null>(null);
  const [rechazando, setRechazando] = useState<PedidoPorConfirmar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function aceptar(p: PedidoPorConfirmar, minutos: number | null) {
    setError(null);
    empezar(async () => {
      let r;
      try {
        r = await aceptarPedidoCliente(p.id, minutos);
      } catch {
        r = { ok: false as const, error: `${MENSAJE_GENERICO}` };
      }
      if (!r.ok) {
        setError(r.error);
        setAceptando(null);
        return;
      }
      setAceptando(null);
      setAviso(`Pedido #${p.numero} aceptado${minutos ? ` · listo en ~${minutos} min` : ""}. Ya está en la plancha.`);
      avisarCambio();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-4 pt-3">
      {aviso && (
        <Aviso tipo="ok" onCerrar={() => setAviso(null)}>
          {aviso}
        </Aviso>
      )}
      {error && (
        <Aviso tipo="error" onCerrar={() => setError(null)}>
          {error}
        </Aviso>
      )}

      {pedidos.length > 0 && (
        <section aria-label="Pedidos de clientes por confirmar" className="space-y-3">
          <h2 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight text-aji">
            Pedidos de clientes ({pedidos.length})
          </h2>
          <ul className="space-y-3">
            {pedidos.map((p) => {
              const domicilio = p.tipo === "domicilio";
              const Icono = domicilio ? Bike : ShoppingBag;
              const telefono = p.contacto_telefono;
              return (
                <li key={p.id} className="rounded-2xl border-4 border-aji bg-sol-suave p-3 shadow-sello">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="cifra text-3xl">#{p.numero}</span>
                        <Badge variante="aji">Cliente en línea</Badge>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-lg font-bold leading-tight">
                        <Icono className="size-5 shrink-0" aria-hidden />
                        {domicilio ? "Domicilio" : "Recoge en el local"}
                      </p>
                    </div>
                    <Espera desde={p.created_at} ahora={ahora} />
                  </div>

                  <div className="mt-2 space-y-1 text-base">
                    <p className="font-bold">{p.contacto_nombre}</p>
                    {telefono && (
                      <p className="flex items-center gap-1.5 text-tinta-2">
                        <Phone className="size-4 shrink-0" aria-hidden /> {formatearTelefono(telefono)}
                      </p>
                    )}
                    {domicilio && p.direccion && (
                      <p className="flex items-start gap-1.5 font-bold">
                        <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {p.direccion}
                      </p>
                    )}
                    {p.notas && <p className="font-bold">“{p.notas}”</p>}
                  </div>

                  <ul className="mt-3 space-y-1.5 border-t-2 border-dashed border-tinta/30 pt-3">
                    {p.items.map((i) => (
                      <li key={i.id} className="text-lg leading-tight">
                        <span className="cifra mr-1.5 text-xl">{i.cantidad}×</span>
                        <span className="font-bold">{i.nombre}</span>
                        {i.adiciones.length > 0 && <span className="block pl-7 text-base text-tinta-2">+ {i.adiciones.map((a) => a.nombre).join(", ")}</span>}
                        {i.notas && <span className="block pl-7 text-base font-bold">“{i.notas}”</span>}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-tinta/30 pt-3">
                    <span className="text-base font-bold">Total (paga al recibir)</span>
                    <span className="cifra text-3xl">{formatearPesos(p.total)}</span>
                  </div>

                  {telefono && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a href={`tel:${telefono}`} className={botonVariantes({ variante: "secundario", tamano: "md" })}>
                        <Phone className="size-5" aria-hidden /> Llamar
                      </a>
                      <a
                        href={enlaceWhatsapp({ telefono, texto: mensajeAlClienteEnLinea({ cliente: p.contacto_nombre ?? "", numero: p.numero, restaurante }) })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={botonVariantes({ variante: "secundario", tamano: "md" })}
                      >
                        <MessageCircle className="size-5" aria-hidden /> WhatsApp
                      </a>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <Button tamano="lg" variante="exito" disabled={pendiente} onClick={() => setAceptando(p)}>
                      Aceptar
                    </Button>
                    <Button tamano="lg" variante="peligro" disabled={pendiente} onClick={() => setRechazando(p)}>
                      Rechazar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {aceptando && (
        <HojaInferior titulo={`Aceptar #${aceptando.numero}`} onCerrar={() => setAceptando(null)}>
          <p className="text-base text-tinta-2">¿En cuánto tiempo estará? El cliente lo verá en su pantalla.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TIEMPOS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={pendiente}
                onClick={() => aceptar(aceptando, m)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 border-tinta bg-papel text-tinta shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none disabled:opacity-40"
                )}
              >
                <span className="cifra text-3xl">{m}</span>
                <span className="text-sm font-bold">min</span>
              </button>
            ))}
          </div>
          <Button variante="secundario" tamano="lg" bloque className="mt-3" disabled={pendiente} onClick={() => aceptar(aceptando, null)}>
            Aceptar sin tiempo estimado
          </Button>
          {pendiente && <p className="mt-2 text-base font-bold">Aceptando…</p>}
        </HojaInferior>
      )}

      {rechazando && (
        <HojaMotivo
          titulo={`Rechazar #${rechazando.numero}`}
          descripcion="El cliente verá este motivo en su pantalla. Sé amable y claro: puede volver a pedir."
          confirmar="Rechazar pedido"
          motivosRapidos={["Se acabó un ingrediente", "Estamos cerrados", "Muy lejos para domicilio", "No pudimos comunicarnos contigo"]}
          onConfirmar={async (motivo) => {
            try {
              const r = await rechazarPedidoCliente(rechazando.id, motivo);
              if (!r.ok) return r.error;
            } catch {
              return MENSAJE_GENERICO;
            }
            setAviso(`Pedido #${rechazando.numero} rechazado.`);
            avisarCambio();
            router.refresh();
            return null;
          }}
          onCerrar={() => setRechazando(null)}
        />
      )}
    </div>
  );
}
