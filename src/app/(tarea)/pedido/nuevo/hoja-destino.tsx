"use client";

import { useState } from "react";
import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmentado } from "@/components/ui/segmentado";
import type { MenuParaPedido, TipoPedido } from "@/lib/datos/tipos";
import { faltaEnDestino, type Destino } from "@/lib/pedido-borrador";
import { cn } from "@/lib/utils";

type Props = {
  mesas: MenuParaPedido["mesas"];
  destino: Destino;
  onElegir: (d: Destino) => void;
  onCerrar: () => void;
};

/**
 * ¿Para quién es? Mesa, para llevar o domicilio. Con una mesa libre basta UN toque; si la mesa ya tiene un
 * pedido abierto se ofrece agregarle platos o hacer uno nuevo.
 */
export function HojaDestino({ mesas, destino, onElegir, onCerrar }: Props) {
  const [borrador, setBorrador] = useState<Destino>(destino);
  const [mesaOcupada, setMesaOcupada] = useState<MenuParaPedido["mesas"][number] | null>(null);

  const cambiar = (parche: Partial<Destino>) => setBorrador((d) => ({ ...d, ...parche }));
  const falta = faltaEnDestino(borrador);

  function elegirMesa(m: MenuParaPedido["mesas"][number]) {
    if (m.pedido_abierto) {
      setMesaOcupada(m);
      return;
    }
    onElegir({ ...borrador, tipo: "mesa", mesaId: m.id, agregarA: null });
  }

  return (
    <HojaInferior titulo="¿Para quién es?" onCerrar={onCerrar}>
      <Segmentado<TipoPedido>
        etiqueta="Tipo de pedido"
        valor={borrador.tipo}
        onCambio={(tipo) => {
          setMesaOcupada(null);
          cambiar({ tipo });
        }}
        opciones={[
          { valor: "mesa", etiqueta: "Mesa", icono: <Utensils className="size-5" aria-hidden /> },
          { valor: "llevar", etiqueta: "Llevar", icono: <ShoppingBag className="size-5" aria-hidden /> },
          { valor: "domicilio", etiqueta: "Domicilio", icono: <Bike className="size-5" aria-hidden /> },
        ]}
      />

      {borrador.tipo === "mesa" && !mesaOcupada && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-tinta-2">Elige la mesa</p>
          <div className="grid grid-cols-3 gap-2">
            {mesas.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => elegirMesa(m)}
                aria-pressed={borrador.mesaId === m.id}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 border-tinta px-1 text-lg font-extrabold leading-tight shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none",
                  m.pedido_abierto ? "bg-sol" : borrador.mesaId === m.id ? "bg-sol-suave" : "bg-papel"
                )}
              >
                {m.nombre}
                {m.pedido_abierto && <span className="text-sm font-bold">Ocupada</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {borrador.tipo === "mesa" && mesaOcupada && (
        <div className="mt-4 space-y-3">
          <p className="text-base">
            <strong>{mesaOcupada.nombre}</strong> ya tiene un pedido abierto. ¿Qué quieres hacer?
          </p>
          <Button
            tamano="lg"
            bloque
            onClick={() => onElegir({ ...borrador, tipo: "mesa", mesaId: mesaOcupada.id, agregarA: mesaOcupada.pedido_abierto })}
          >
            Agregar a ese pedido
          </Button>
          <Button variante="secundario" tamano="lg" bloque onClick={() => onElegir({ ...borrador, tipo: "mesa", mesaId: mesaOcupada.id, agregarA: null })}>
            Hacer un pedido nuevo
          </Button>
          <Button variante="fantasma" bloque onClick={() => setMesaOcupada(null)}>
            Elegir otra mesa
          </Button>
        </div>
      )}

      {borrador.tipo === "llevar" && (
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="nombre-llevar">A nombre de (opcional)</Label>
            <Input
              id="nombre-llevar"
              value={borrador.contactoNombre}
              onChange={(e) => cambiar({ contactoNombre: e.target.value })}
              maxLength={60}
              placeholder="Ej. Daniela"
              autoCapitalize="words"
            />
          </div>
          <Button tamano="lg" bloque onClick={() => onElegir({ ...borrador, mesaId: null, agregarA: null })}>
            Listo
          </Button>
        </div>
      )}

      {borrador.tipo === "domicilio" && (
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              value={borrador.direccion}
              onChange={(e) => cambiar({ direccion: e.target.value })}
              maxLength={120}
              placeholder="Ej. Cra 15 #8-22, apto 301"
              autoCapitalize="sentences"
            />
          </div>
          <div>
            <Label htmlFor="nombre-dom">Nombre (opcional)</Label>
            <Input id="nombre-dom" value={borrador.contactoNombre} onChange={(e) => cambiar({ contactoNombre: e.target.value })} maxLength={60} autoCapitalize="words" />
          </div>
          <div>
            <Label htmlFor="tel-dom">Teléfono (opcional)</Label>
            <Input id="tel-dom" type="tel" inputMode="tel" value={borrador.contactoTelefono} onChange={(e) => cambiar({ contactoTelefono: e.target.value })} maxLength={20} placeholder="300 123 4567" />
          </div>
          <Button tamano="lg" bloque disabled={falta !== null} onClick={() => onElegir({ ...borrador, mesaId: null, agregarA: null })}>
            Listo
          </Button>
        </div>
      )}
    </HojaInferior>
  );
}
