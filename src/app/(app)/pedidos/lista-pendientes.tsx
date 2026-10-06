"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Bike, ClipboardList, Ellipsis, MapPin, Phone, ShoppingBag, Undo2, Utensils } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { HojaMotivo } from "@/components/ui/hoja-motivo";
import { Segmentado } from "@/components/ui/segmentado";
import type { EstadoPedido, PedidoCobrado, PedidoPendiente, TipoPedido } from "@/lib/datos/tipos";
import { ETIQUETA_MEDIO, formatearPesos } from "@/lib/dinero";
import { horaCorta } from "@/lib/fechas";
import { Enlace, useIr } from "@/lib/navegacion";
import { anularCobro, anularPedido, cambiarEstado } from "@/lib/sync/acciones";
import { useEstadoSync } from "@/lib/sync/cliente";
import { numeroVisible } from "@/lib/sync/numero";
import { formatearTelefono } from "@/lib/telefono";
import { cn } from "@/lib/utils";
import { Espera } from "./espera";

type Vista = "pendientes" | "cobrados";

const ICONO_TIPO: Record<TipoPedido, typeof Utensils> = { mesa: Utensils, llevar: ShoppingBag, domicilio: Bike };

function dondeEs(p: { tipo: TipoPedido; mesa: string | null; contacto_nombre: string | null }): string {
  if (p.tipo === "mesa") return p.mesa ?? "Mesa";
  if (p.tipo === "llevar") return p.contacto_nombre ? `Llevar · ${p.contacto_nombre}` : "Para llevar";
  return p.contacto_nombre ? `Domicilio · ${p.contacto_nombre}` : "Domicilio";
}

const SIGUIENTE: Record<EstadoPedido, { estado: EstadoPedido; etiqueta: string; variante: "exito" | "oscuro" } | null> = {
  pendiente: { estado: "listo", etiqueta: "Marcar listo", variante: "exito" },
  listo: { estado: "entregado", etiqueta: "Entregado", variante: "oscuro" },
  entregado: null,
};

const ANTERIOR: Record<EstadoPedido, { estado: EstadoPedido; etiqueta: string } | null> = {
  pendiente: null,
  listo: { estado: "pendiente", etiqueta: "Volver a pendiente" },
  entregado: { estado: "listo", etiqueta: "Volver a listo" },
};

export function ListaPendientes({
  pendientes,
  cobrados,
  ahora,
  enviado,
}: {
  pendientes: PedidoPendiente[];
  cobrados: PedidoCobrado[];
  ahora: string;
  /** Número del pedido recién enviado (para el aviso verde). */
  enviado: { numero: number; agregado: boolean; pendiente?: boolean } | null;
}) {
  const router = useIr();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [error, setError] = useState<string | null>(null);
  const [avisoEnviado, setAvisoEnviado] = useState(enviado);
  const [menuDe, setMenuDe] = useState<PedidoPendiente | null>(null);
  const [anulando, setAnulando] = useState<{ tipo: "pedido" | "cobro"; id: string; numero: number } | null>(null);
  const [, empezar] = useTransition();

  // Actualización inmediata: el cambio de estado se ve al instante y el servidor confirma después.
  const [lista, aplicarOptimista] = useOptimistic(pendientes, (estado, cambio: { id: string; estado: EstadoPedido }) =>
    estado
      .map((p) => (p.id === cambio.id ? { ...p, estado: cambio.estado } : p))
      .filter((p) => !(p.estado === "entregado" && p.cobrado))
  );

  // Pedidos con cambios todavía por subir: no se pueden anular hasta que el servidor los conozca.
  const enCola = new Set(
    useEstadoSync()
      .ops.filter((o) => o.estado !== "fallida")
      .flatMap((o) => ("pedidoId" in o.datos ? [o.datos.pedidoId] : o.tipo === "crear_pedido" ? [o.datos.id] : []))
  );
  const numeroMasNuevo = pendientes.reduce((m, p) => Math.max(m, p.numero), 0);

  function mover(id: string, estado: EstadoPedido) {
    setError(null);
    setMenuDe(null);
    empezar(async () => {
      aplicarOptimista({ id, estado });
      const r = await cambiarEstado(id, estado);
      if (!r.ok) setError(r.error);
    });
  }

  function cerrarAviso() {
    setAvisoEnviado(null);
    router.replace("/pedidos");
  }

  return (
    <>
      <div className="space-y-3 px-4 pt-3">
        {avisoEnviado && (
          <Aviso tipo="ok" onCerrar={cerrarAviso}>
            {avisoEnviado.agregado ? `Platos agregados al pedido ${numeroVisible(avisoEnviado.numero)}.` : `Pedido ${numeroVisible(avisoEnviado.numero)} enviado a cocina.`}
            {avisoEnviado.pendiente && " Sin señal: se sube solo cuando vuelva."}
          </Aviso>
        )}
        {error && (
          <Aviso tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Aviso>
        )}
        <Segmentado<Vista>
          etiqueta="Qué pedidos ver"
          valor={vista}
          onCambio={setVista}
          opciones={[
            { valor: "pendientes", etiqueta: `Pendientes (${lista.length})` },
            { valor: "cobrados", etiqueta: `Cobrados hoy (${cobrados.length})` },
          ]}
        />
      </div>

      {vista === "pendientes" ? (
        lista.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-4 pt-10">
            <ClipboardList className="size-10" aria-hidden />
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none">Todo al día</h2>
            <p className="text-lg text-tinta-2">No hay pedidos por entregar ni por cobrar.</p>
            <Enlace href="/pedido/nuevo" className={botonVariantes({ tamano: "lg" })}>
              Tomar un pedido
            </Enlace>
          </div>
        ) : (
          <ul className="space-y-4 px-4 pt-3">
            {lista.map((p) => {
              const guia = p.numero === numeroMasNuevo ? "avanzar" : undefined; // el recorrido guiado sigue al pedido recién enviado
              const Icono = ICONO_TIPO[p.tipo];
              const siguiente = SIGUIENTE[p.estado];
              return (
                <li key={p.id} className="rounded-2xl border-2 border-tinta bg-papel p-3 shadow-sello">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="cifra text-3xl">{numeroVisible(p.numero)}</span>
                        <span className="flex min-w-0 items-center gap-1 text-lg font-bold leading-tight">
                          <Icono className="size-5 shrink-0" aria-hidden />
                          <span className="truncate">{dondeEs(p)}</span>
                        </span>
                      </p>
                      <Espera desde={p.created_at} ahora={ahora} alertar={p.estado !== "entregado"} />
                    </div>
                    <Badge variante={p.estado === "listo" ? "listo" : p.estado === "pendiente" ? "sol" : "neutro"}>
                      {p.estado === "pendiente" ? "Pendiente" : p.estado === "listo" ? "Listo" : "Entregado"}
                    </Badge>
                  </div>

                  {p.tipo === "domicilio" && (
                    <div className="mt-2 space-y-0.5 text-base text-tinta-2">
                      {p.direccion && (
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {p.direccion}
                        </p>
                      )}
                      {p.contacto_telefono && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="size-4 shrink-0" aria-hidden /> {formatearTelefono(p.contacto_telefono)}
                        </p>
                      )}
                    </div>
                  )}
                  {p.notas && <p className="mt-2 text-base font-bold">“{p.notas}”</p>}

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
                    <span className="text-base font-bold">{p.cobrado ? "Cobrado" : "Total"}</span>
                    <span className="cifra text-3xl">{formatearPesos(p.total)}</span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    {siguiente && (
                      <Button variante={siguiente.variante} tamano="lg" className="flex-1" data-guia={guia} onClick={() => mover(p.id, siguiente.estado)}>
                        {siguiente.etiqueta}
                      </Button>
                    )}
                    {!p.cobrado && (
                      <Enlace href={`/pedidos/${p.id}/cobrar`} data-guia={guia} className={cn(botonVariantes({ variante: "primario", tamano: "lg" }), "flex-1")}>
                        Cobrar
                      </Enlace>
                    )}
                    <Button variante="secundario" tamano="icono" className="size-14 shrink-0" aria-label={`Más opciones del pedido ${numeroVisible(p.numero)}`} onClick={() => setMenuDe(p)}>
                      <Ellipsis className="size-6" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : cobrados.length === 0 ? (
        <p className="px-4 pt-10 text-lg text-tinta-2">Todavía no has cobrado ningún pedido hoy.</p>
      ) : (
        <ul className="space-y-3 px-4 pt-3">
          {cobrados.map((c) => (
            <li key={c.id} className="rounded-2xl border-2 border-tinta bg-papel p-3 shadow-sello-chico">
              <div className="flex items-baseline justify-between gap-2">
                <p className="flex items-baseline gap-2">
                  <span className="cifra text-2xl">{numeroVisible(c.numero)}</span>
                  <span className="text-base font-bold">{dondeEs(c)}</span>
                </p>
                <span className="cifra text-2xl">{formatearPesos(c.total + c.propina)}</span>
              </div>
              <p className="mt-0.5 text-base text-tinta-2">
                {horaCorta(c.cobrado_at)} · {c.medios.map((m) => ETIQUETA_MEDIO[m]).join(" + ")}
                {c.propina > 0 && ` · propina ${formatearPesos(c.propina)}`}
              </p>
              {enCola.has(c.id) ? (
                <p className="mt-2 text-base text-tinta-2">Se sube con la señal; después podrás anularlo si hace falta.</p>
              ) : (
                <Button variante="secundario" className="mt-2" onClick={() => setAnulando({ tipo: "cobro", id: c.id, numero: c.numero })}>
                  <Undo2 className="size-5" aria-hidden /> Anular cobro
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {menuDe && (
        <HojaInferior titulo={`Pedido ${numeroVisible(menuDe.numero)}`} onCerrar={() => setMenuDe(null)}>
          <div className="space-y-3">
            <Enlace href={`/pedido/nuevo?agregar=${menuDe.id}`} className={botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })}>
              Agregar platos
            </Enlace>
            {ANTERIOR[menuDe.estado] && (
              <Button variante="secundario" tamano="lg" bloque onClick={() => mover(menuDe.id, ANTERIOR[menuDe.estado]!.estado)}>
                {ANTERIOR[menuDe.estado]!.etiqueta}
              </Button>
            )}
            {enCola.has(menuDe.id) ? (
              <p className="text-base text-tinta-2">Este pedido tiene cambios por subir: cuando se suban podrás anularlo.</p>
            ) : (
              <Button
                variante="peligro"
                tamano="lg"
                bloque
                onClick={() => {
                  setAnulando({ tipo: "pedido", id: menuDe.id, numero: menuDe.numero });
                  setMenuDe(null);
                }}
              >
                Anular pedido
              </Button>
            )}
          </div>
        </HojaInferior>
      )}

      {anulando && (
        <HojaMotivo
          titulo={anulando.tipo === "pedido" ? `Anular pedido ${numeroVisible(anulando.numero)}` : `Anular cobro ${numeroVisible(anulando.numero)}`}
          descripcion={
            anulando.tipo === "pedido"
              ? "No se borra: queda registrado con el motivo y quién lo anuló. Si estaba cobrado o fiado, también se anula."
              : "Se anula el pago y el pedido vuelve a quedar por cobrar. Queda registrado con el motivo."
          }
          confirmar={anulando.tipo === "pedido" ? "Anular pedido" : "Anular cobro"}
          motivosRapidos={anulando.tipo === "pedido" ? ["Cliente se fue", "Error al tomarlo", "Sin ingredientes"] : ["Me equivoqué de medio", "Monto mal cobrado", "Pedido duplicado"]}
          onConfirmar={async (motivo) => {
            const r = anulando.tipo === "pedido" ? await anularPedido(anulando.id, motivo) : await anularCobro(anulando.id, motivo);
            return r.ok ? null : r.error;
          }}
          onCerrar={() => setAnulando(null)}
        />
      )}
    </>
  );
}
