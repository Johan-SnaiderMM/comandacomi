"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { entrarDemo, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { DESTINOS_DE_ENTRADA, destinoDeEntrada } from "@/lib/destinos";

/**
 * Botón "Entrar a la demo": un solo toque, sin pedir ningún dato. Con `ir` (de la lista cerrada de destinos) entra
 * directo a esa pantalla: así se comparte un enlace por rol (parrilla, mesero).
 */
export function FormularioEntrar({ ir = null }: { ir?: string | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada, FormData>(entrarDemo, { error: null });

  return (
    <form action={accion}>
      {ir && <input type="hidden" name="ir" value={ir} />}
      <Button type="submit" tamano="lg" bloque disabled={pendiente}>
        {pendiente ? "Entrando…" : "Entrar a la demo"}
      </Button>
      {estado.error ? (
        <p role="alert" className="mt-2 text-center text-sm font-bold text-aji">
          {estado.error}
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-tinta-2">
          {ir ? `Entras directo a ${DESTINOS_DE_ENTRADA[ir]}. ` : ""}Sin registro. Todos los datos son de ejemplo.
        </p>
      )}
    </form>
  );
}

/** Lee `?ir=` de la dirección (la portada sigue siendo estática: esto corre en el navegador). */
export function EntrarConDestino() {
  const ir = destinoDeEntrada(useSearchParams().get("ir"));
  return <FormularioEntrar ir={ir} />;
}
