"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClienteFiado } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { crearCliente } from "@/lib/sync/acciones";

/** ¿A quién se le fía? Lista de clientes (con lo que ya deben) y alta rápida de uno nuevo. */
export function HojaCliente({
  clientes,
  onElegir,
  onCerrar,
}: {
  clientes: ClienteFiado[];
  onElegir: (c: ClienteFiado) => void;
  onCerrar: () => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await crearCliente(nombre, telefono);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onElegir({ id: r.datos.id, nombre: r.datos.nombre, telefono: r.datos.telefono, saldo: 0, debe_desde: null });
    });
  }

  return (
    <HojaInferior titulo={nuevo ? "Cliente nuevo" : "¿A quién se le fía?"} onCerrar={onCerrar}>
      {nuevo ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="cliente-nombre">Nombre</Label>
            <Input id="cliente-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoCapitalize="words" />
          </div>
          <div>
            <Label htmlFor="cliente-tel">WhatsApp (para recordarle la deuda)</Label>
            <Input id="cliente-tel" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} placeholder="300 123 4567" />
          </div>
          {error && (
            <p role="alert" className="text-base font-bold text-aji">
              {error}
            </p>
          )}
          <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={guardar}>
            {pendiente ? "Guardando…" : "Guardar y elegir"}
          </Button>
          <Button variante="fantasma" bloque onClick={() => setNuevo(false)}>
            Volver a la lista
          </Button>
        </div>
      ) : (
        <>
          <Button variante="secundario" tamano="lg" bloque onClick={() => setNuevo(true)}>
            <UserPlus className="size-5" aria-hidden /> Cliente nuevo
          </Button>
          <ul className="mt-3 space-y-2">
            {clientes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 border-tinta bg-papel px-3 text-left shadow-sello-chico transition-[transform,box-shadow] duration-75 active:translate-y-[2px] active:shadow-none"
                >
                  <span className="text-lg font-bold leading-tight">{c.nombre}</span>
                  <span className={`text-sm font-bold ${c.saldo > 0 ? "text-aji" : "text-tinta-2"}`}>{c.saldo > 0 ? `Debe ${formatearPesos(c.saldo)}` : "Al día"}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </HojaInferior>
  );
}
