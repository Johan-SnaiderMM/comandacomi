"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, ShoppingBag } from "lucide-react";
import { enviarPedidoCliente } from "@/app/acciones/publico";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmentado } from "@/components/ui/segmentado";
import { Stepper } from "@/components/ui/stepper";
import { formatearPesos } from "@/lib/dinero";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { aItemsDeEnvio, subtotalDe, totalBorrador, type Accion, type Borrador } from "@/lib/pedido-borrador";

type Tipo = "llevar" | "domicilio";

const CLAVE_DATOS = "pedir:datos";

type DatosGuardados = { nombre: string; telefono: string; direccion: string };

function leerDatos(): DatosGuardados {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE_DATOS) ?? "{}") as Partial<DatosGuardados>;
    return { nombre: v.nombre ?? "", telefono: v.telefono ?? "", direccion: v.direccion ?? "" };
  } catch {
    return { nombre: "", telefono: "", direccion: "" };
  }
}

/**
 * Hoja del pedido del cliente: sus platos, si lo recoge o lo llevamos, sus datos y el botón de enviar. Recuerda el
 * nombre, el celular y la dirección en este celular para la próxima vez (solo en el celular; nada sale a otro lado).
 */
export function HojaPedidoCliente({
  slug,
  borrador,
  despachar,
  onCerrar,
}: {
  slug: string;
  borrador: Borrador;
  despachar: (a: Accion) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  // Esta hoja solo se monta después de que la persona toca "Ver mi pedido" (nunca en el HTML del servidor), así que
  // puede leer lo recordado de este celular al crearse.
  const [recordados] = useState(leerDatos);
  const [tipo, setTipo] = useState<Tipo>("llevar");
  const [nombre, setNombre] = useState(recordados.nombre);
  const [telefono, setTelefono] = useState(recordados.telefono);
  const [direccion, setDireccion] = useState(recordados.direccion);
  const [notas, setNotas] = useState("");
  const [sitio, setSitio] = useState(""); // campo trampa: una persona no lo ve ni lo llena
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  const total = totalBorrador(borrador);
  const faltan =
    borrador.lineas.length === 0 || nombre.trim().length < 2 || telefono.replace(/\D/g, "").length < 7 || (tipo === "domicilio" && direccion.trim().length < 5);

  function enviar() {
    setError(null);
    empezar(async () => {
      let r;
      try {
        r = await enviarPedidoCliente({ slug, tipo, nombre, telefono, direccion, notas, sitio, items: aItemsDeEnvio(borrador) });
      } catch {
        r = { ok: false as const, error: `${MENSAJE_GENERICO}` };
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      try {
        window.localStorage.setItem(CLAVE_DATOS, JSON.stringify({ nombre, telefono, direccion }));
        window.localStorage.setItem(`pedido-en-curso:${slug}`, JSON.stringify({ token: r.datos.token, numero: r.datos.numero, at: Date.now() }));
      } catch {
        // sin localStorage el pedido se envía igual; solo no se recuerdan los datos
      }
      router.push(`/seguimiento/${r.datos.token}`);
    });
  }

  return (
    <HojaInferior titulo="Tu pedido" onCerrar={onCerrar}>
      {borrador.lineas.length === 0 ? (
        <p className="py-6 text-center text-lg text-tinta-2">Todavía no hay platos. Cierra esta ventana y toca “Agregar”.</p>
      ) : (
        <ul className="divide-y-2 divide-dashed divide-tinta/30">
          {borrador.lineas.map((l) => (
            <li key={l.clave} className="flex items-center gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{l.nombre}</p>
                {l.adiciones.length > 0 && <p className="text-sm text-tinta-2">+ {l.adiciones.map((a) => a.nombre).join(", ")}</p>}
                {l.notas && <p className="text-sm font-bold">“{l.notas}”</p>}
                <p className="cifra mt-1 text-xl">{formatearPesos(subtotalDe(l))}</p>
              </div>
              <Stepper valor={l.cantidad} minimo={0} maximo={20} etiqueta={l.nombre} onCambio={(n) => despachar({ tipo: "cambiar", clave: l.clave, delta: n - l.cantidad })} />
            </li>
          ))}
        </ul>
      )}

      <hr className="separador-punteado my-3" />
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold">Total</span>
        <span className="cifra text-4xl">{formatearPesos(total)}</span>
      </div>
      <p className="mt-1 text-sm text-tinta-2">Pagas al recibir (efectivo o Nequi). {tipo === "domicilio" && "El restaurante te confirma si el domicilio tiene costo."}</p>

      <div className="mt-4">
        <Segmentado<Tipo>
          etiqueta="¿Cómo lo quieres?"
          valor={tipo}
          onCambio={setTipo}
          opciones={[
            { valor: "llevar", etiqueta: "Voy a recogerlo", icono: <ShoppingBag className="size-5" aria-hidden /> },
            { valor: "domicilio", etiqueta: "Domicilio", icono: <Bike className="size-5" aria-hidden /> },
          ]}
        />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="cliente-nombre">Tu nombre</Label>
          <Input id="cliente-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoComplete="name" autoCapitalize="words" />
        </div>
        <div>
          <Label htmlFor="cliente-celular">Tu celular (para avisarte)</Label>
          <Input
            id="cliente-celular"
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            placeholder="300 123 4567"
          />
        </div>
        {tipo === "domicilio" && (
          <div>
            <Label htmlFor="cliente-direccion">Dirección (barrio, calle y número)</Label>
            <Input
              id="cliente-direccion"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              maxLength={120}
              autoComplete="street-address"
              placeholder="Cra 7 #8-9, barrio Centro"
            />
          </div>
        )}
        <div>
          <Label htmlFor="cliente-notas">Algo más que debamos saber (opcional)</Label>
          <Input id="cliente-notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} placeholder={tipo === "domicilio" ? "Ej.: casa azul, tocar el timbre" : "Ej.: paso en 15 minutos"} />
        </div>
        <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label>
            Sitio web
            <input tabIndex={-1} autoComplete="off" value={sitio} onChange={(e) => setSitio(e.target.value)} />
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-base font-bold text-aji">
          {error}
        </p>
      )}
      <Button tamano="lg" bloque className="mt-4 justify-between gap-3" disabled={faltan || enviando} onClick={enviar}>
        {enviando ? (
          "Enviando…"
        ) : (
          <>
            <span>Enviar pedido</span>
            <span className="cifra text-2xl">{formatearPesos(total)}</span>
          </>
        )}
      </Button>
      {borrador.lineas.length > 0 && (
        <Button variante="fantasma" bloque className="mt-1" disabled={enviando} onClick={() => despachar({ tipo: "vaciar" })}>
          Vaciar pedido
        </Button>
      )}
    </HojaInferior>
  );
}
