"use client";

import { useActionState } from "react";
import { entrarDemo, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";

/** Botón "Entrar a la demo": un solo toque, sin pedir ningún dato. */
export function FormularioEntrar() {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada, FormData>(entrarDemo, { error: null });

  return (
    <form action={accion}>
      <Button type="submit" tamano="lg" bloque disabled={pendiente}>
        {pendiente ? "Entrando…" : "Entrar a la demo"}
      </Button>
      {estado.error ? (
        <p role="alert" className="mt-2 text-center text-sm font-bold text-aji">
          {estado.error}
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-tinta-2">Sin registro. Todos los datos son de ejemplo.</p>
      )}
    </form>
  );
}
