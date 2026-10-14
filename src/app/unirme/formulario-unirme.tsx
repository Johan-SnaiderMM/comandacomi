"use client";

import { useActionState, useState } from "react";
import { unirmeAlEquipo, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { codigoValido, formatearCodigo, normalizarCodigo } from "@/lib/invitaciones";

/**
 * El código de invitación: viene puesto si se llegó por el enlace o el QR; si no, se escribe (mayúsculas solas, el
 * guion se pone solo). Un solo botón.
 */
export function FormularioUnirme({ codigo = "" }: { codigo?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada, FormData>(unirmeAlEquipo, { error: null });
  const [texto, setTexto] = useState(() => formatearCodigo(normalizarCodigo(codigo)));
  const listo = codigoValido(normalizarCodigo(texto));

  return (
    <form action={accion} className="space-y-3">
      <label htmlFor="codigo" className="block text-base font-bold">
        Código de invitación
      </label>
      <input
        id="codigo"
        name="codigo"
        value={texto}
        onChange={(e) => {
          const limpio = normalizarCodigo(e.target.value).slice(0, 8);
          setTexto(limpio.length > 4 ? formatearCodigo(limpio.padEnd(8, " ")).trimEnd() : limpio);
        }}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        placeholder="K7MP-2XQ9"
        className="h-16 w-full rounded-xl border-2 border-tinta bg-papel px-4 text-center font-mono text-3xl font-bold tracking-[0.2em] uppercase placeholder:text-tinta/25"
      />
      <Button type="submit" tamano="lg" bloque disabled={pendiente || !listo}>
        {pendiente ? "Entrando…" : "Unirme al equipo"}
      </Button>
      {estado.error && (
        <p role="alert" className="text-center text-base font-bold text-aji">
          {estado.error}
        </p>
      )}
    </form>
  );
}
