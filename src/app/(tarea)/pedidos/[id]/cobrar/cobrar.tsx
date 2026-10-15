"use client";

import { useState, useTransition } from "react";
import { Banknote, ChevronDown, Smartphone, NotebookPen } from "lucide-react";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmentado } from "@/components/ui/segmentado";
import { TecladoNumerico } from "@/components/ui/teclado-numerico";
import type { ClienteFiado, PedidoDetalle } from "@/lib/datos/tipos";
import { atajosEfectivo, calcularEfectivo, formatearPesos, planDePagos, validarCobro, type MedioPago } from "@/lib/dinero";
import { nombreCorto } from "@/lib/nombres";
import { Enlace } from "@/lib/navegacion";
import { cobrarPedido, type Cobrado } from "@/lib/sync/acciones";
import { numeroVisible } from "@/lib/sync/numero";
import { aplicarTecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";
import { Confirmacion } from "./confirmacion";
import { HojaCliente } from "./hoja-cliente";
import { HojaPropina } from "./hoja-propina";

export type Resultado = Cobrado & { medio: MedioPago; cliente: ClienteFiado | null; pagadoAhora: number };

function NoCobrable({ numero, anulado }: { numero: number; anulado: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-4 px-4">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none">{anulado ? "Pedido anulado" : "Ya está cobrado"}</h1>
      <p className="text-lg text-tinta-2">
        El pedido {numeroVisible(numero)} {anulado ? "fue anulado" : "ya se cobró"}. No hay nada más por hacer aquí.
      </p>
      <Enlace href="/pedidos" className={botonVariantes({ tamano: "lg" })}>
        Volver a pendientes
      </Enlace>
    </main>
  );
}

export function Cobrar({ detalle, clientes: clientesIniciales }: { detalle: PedidoDetalle; clientes: ClienteFiado[] }) {
  const { pedido } = detalle;
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [propina, setPropina] = useState(0);
  const [recibido, setRecibido] = useState(0);
  const [referencia, setReferencia] = useState("");
  const [clientes, setClientes] = useState(clientesIniciales);
  const [cliente, setCliente] = useState<ClienteFiado | null>(null);
  const [pagaAhora, setPagaAhora] = useState(0);
  const [abonando, setAbonando] = useState(false);
  const [hoja, setHoja] = useState<"propina" | "cliente" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, empezar] = useTransition();

  const aCobrar = pedido.total + propina;
  const efectivo = calcularEfectivo(recibido, aCobrar);
  const donde = pedido.mesa ?? pedido.contacto_nombre ?? (pedido.tipo === "llevar" ? "Para llevar" : "Domicilio");

  const pagos = planDePagos({ medio, aCobrar, recibido, referencia, clienteId: cliente?.id ?? null, pagaAhora });
  const validacion = validarCobro(pedido.total, propina, pagos);
  const restoFiado = aCobrar - pagaAhora;

  function cobrar() {
    if (!validacion.ok) {
      setError(validacion.error);
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await cobrarPedido({
        pedidoId: pedido.id,
        propina,
        pagos: pagos.map((p) => ({ medio: p.medio, monto: p.monto, recibido: p.recibido, referencia: p.referencia, clienteId: p.clienteId })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResultado({ ...r.datos, medio, cliente, pagadoAhora: medio === "efectivo" ? 0 : pagaAhora });
    });
  }

  // La confirmación se conserva aunque el servidor refresque la página (el pedido ya figura como cobrado).
  if (resultado) return <Confirmacion resultado={resultado} />;
  if (pedido.anulado || pedido.cobrado) return <NoCobrable numero={pedido.numero} anulado={pedido.anulado} />;

  // Etiqueta del botón principal: dice exactamente qué va a pasar.
  let etiquetaAccion: string;
  let puedeCobrar = validacion.ok && !enviando;
  if (medio === "efectivo") {
    etiquetaAccion = recibido === 0 ? "Escribe lo que recibes" : efectivo.alcanza ? `Cobrar · vuelto ${formatearPesos(efectivo.vuelto)}` : `Faltan ${formatearPesos(efectivo.falta)}`;
  } else if (medio === "transferencia") {
    etiquetaAccion = abonando && pagaAhora === 0 ? "Escribe cuánto paga en efectivo" : `Cobrar ${formatearPesos(aCobrar)}`;
    puedeCobrar = puedeCobrar && !(abonando && pagaAhora === 0);
  } else {
    etiquetaAccion = cliente ? `Fiar ${formatearPesos(restoFiado)} a ${nombreCorto(cliente.nombre)}` : "Elige a quién se le fía";
    puedeCobrar = puedeCobrar && cliente !== null;
  }
  if (enviando) etiquetaAccion = "Cobrando…";

  return (
    <div className="flex min-h-dvh flex-col">
      <EncabezadoPantalla
        titulo={`Cobrar ${numeroVisible(pedido.numero)}`}
        atras="/pedidos"
        derecha={<span className="mr-2 max-w-28 truncate text-base font-bold">{donde}</span>}
      />

      <main className="flex flex-1 flex-col gap-2 px-4 pt-2 pb-[calc(var(--accion-h)+var(--seguro-abajo))]">
        {/* Total a cobrar (grande) y propina opcional a un lado */}
        <section aria-label="Total a cobrar" className="tiquete border-2 border-b-0 border-tinta px-3 pt-2 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">A cobrar</p>
              <p className="cifra text-[2.75rem]">{formatearPesos(aCobrar)}</p>
            </div>
            <button
              type="button"
              onClick={() => setHoja("propina")}
              className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl border-2 border-tinta bg-papel px-3 text-base font-bold leading-tight shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none"
            >
              <span className="text-left">
                Propina
                <span className="block text-base">{propina > 0 ? formatearPesos(propina) : "Sin"}</span>
              </span>
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        </section>

        <Segmentado<MedioPago>
          etiqueta="Cómo paga"
          valor={medio}
          onCambio={(m) => {
            setMedio(m);
            setError(null);
            // "Una parte en efectivo" es de cada medio: al cambiar se empieza de cero (no se arrastra a escondidas).
            setAbonando(false);
            setPagaAhora(0);
          }}
          opciones={[
            { valor: "efectivo", etiqueta: "Efectivo", icono: <Banknote className="size-5" aria-hidden /> },
            { valor: "transferencia", etiqueta: "Nequi", icono: <Smartphone className="size-5" aria-hidden /> },
            { valor: "fiado", etiqueta: "Fiado", icono: <NotebookPen className="size-5" aria-hidden /> },
          ]}
        />

        {medio === "efectivo" && (
          <>
            <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-tinta bg-papel px-3 py-1">
              <div>
                <p className="text-sm font-bold uppercase leading-tight tracking-wide text-tinta-2">Recibido</p>
                <p className="cifra text-[2.25rem]">{formatearPesos(recibido)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase leading-tight tracking-wide text-tinta-2">{recibido === 0 || efectivo.alcanza ? "Vuelto" : "Faltan"}</p>
                <p className={cn("cifra text-[2.25rem]", recibido > 0 && (efectivo.alcanza ? "text-listo" : "text-aji"))}>
                  {formatearPesos(recibido === 0 ? 0 : efectivo.alcanza ? efectivo.vuelto : efectivo.falta)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {atajosEfectivo(aCobrar).map((valor, i) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setRecibido(valor)}
                  className={cn(
                    "min-h-12 rounded-xl border-2 border-tinta text-base font-bold leading-tight transition-[transform,box-shadow] duration-75 active:translate-y-[2px]",
                    recibido === valor ? "bg-sol" : "bg-papel"
                  )}
                >
                  {i === 0 && valor === aCobrar ? "Exacto" : formatearPesos(valor).replace("$ ", "")}
                </button>
              ))}
            </div>
            <TecladoNumerico onTecla={(t) => setRecibido((v) => aplicarTecla(v, t))} />
          </>
        )}

        {medio === "transferencia" && (
          <>
            <div className="rounded-xl border-2 border-tinta bg-papel p-3">
              <p className="text-lg font-bold leading-tight">Nequi, Daviplata o transferencia del banco</p>
              {!abonando && <p className="mt-1 text-base text-tinta-2">Confirma que el dinero llegó antes de cobrar.</p>}
              <Label htmlFor="referencia" className="mt-3">
                Referencia (opcional)
              </Label>
              <Input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} placeholder="Ej. M1234567" autoCapitalize="characters" />
            </div>
            {/* Pago dividido: una parte en efectivo (exacta, sin vuelto) y el resto por transferencia. */}
            {abonando ? (
              <>
                <div className="rounded-xl border-2 border-tinta bg-papel px-3 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Paga en efectivo</p>
                      <p className="cifra text-4xl">{formatearPesos(pagaAhora)}</p>
                    </div>
                    <Button
                      variante="fantasma"
                      onClick={() => {
                        setAbonando(false);
                        setPagaAhora(0);
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                  <p className="flex items-baseline justify-between border-t-2 border-dashed border-tinta/30 pt-1 text-base">
                    <span>El resto, por Nequi</span>
                    <span className="cifra text-2xl">{formatearPesos(aCobrar - pagaAhora)}</span>
                  </p>
                </div>
                <TecladoNumerico onTecla={(t) => setPagaAhora((v) => Math.min(aplicarTecla(v, t), aCobrar - 1))} />
              </>
            ) : (
              <Button variante="secundario" bloque onClick={() => setAbonando(true)}>
                Paga una parte en efectivo
              </Button>
            )}
          </>
        )}

        {medio === "fiado" && (
          <>
            <button
              type="button"
              onClick={() => setHoja("cliente")}
              className={cn(
                "flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border-2 border-tinta px-3 text-left shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none",
                cliente ? "bg-papel" : "bg-sol"
              )}
            >
              <span className="text-lg font-bold leading-tight">
                {cliente ? cliente.nombre : "Elegir cliente"}
                {cliente && <span className="block text-base font-normal text-tinta-2">{cliente.saldo > 0 ? `Ya debe ${formatearPesos(cliente.saldo)}` : "Está al día"}</span>}
              </span>
              <ChevronDown className="size-5 shrink-0" aria-hidden />
            </button>
            <div className="rounded-xl border-2 border-tinta bg-papel p-3">
              <p className="flex items-baseline justify-between text-base">
                <span>Se anota a su cuenta</span>
                <span className="cifra text-3xl text-aji">{formatearPesos(restoFiado)}</span>
              </p>
              {cliente && restoFiado > 0 && (
                <p className="mt-1 text-base text-tinta-2">Después de esto debería {formatearPesos(cliente.saldo + restoFiado)}.</p>
              )}
            </div>
            {abonando ? (
              <>
                <div className="flex items-center justify-between rounded-xl border-2 border-tinta bg-papel px-3 py-1.5">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Paga ahora en efectivo</p>
                    <p className="cifra text-4xl">{formatearPesos(pagaAhora)}</p>
                  </div>
                  <Button
                    variante="fantasma"
                    onClick={() => {
                      setAbonando(false);
                      setPagaAhora(0);
                    }}
                  >
                    Quitar
                  </Button>
                </div>
                <TecladoNumerico onTecla={(t) => setPagaAhora((v) => Math.min(aplicarTecla(v, t), aCobrar - 1))} />
              </>
            ) : (
              <Button variante="secundario" bloque onClick={() => setAbonando(true)}>
                Paga una parte ahora
              </Button>
            )}
          </>
        )}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>

      <BarraAccion>
        <Button tamano="lg" bloque variante={medio === "fiado" ? "oscuro" : "exito"} disabled={!puedeCobrar} onClick={cobrar}>
          {etiquetaAccion}
        </Button>
      </BarraAccion>

      {hoja === "propina" && (
        <HojaPropina
          cuenta={pedido.total}
          propina={propina}
          onElegir={(v) => {
            setPropina(v);
            setPagaAhora((p) => Math.min(p, Math.max(0, pedido.total + v - 1)));
            setHoja(null);
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "cliente" && (
        <HojaCliente
          clientes={clientes}
          onElegir={(c) => {
            setClientes((lista) => (lista.some((x) => x.id === c.id) ? lista : [c, ...lista]));
            setCliente(c);
            setHoja(null);
          }}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}
