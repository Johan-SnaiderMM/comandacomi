import { Lock } from "lucide-react";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { botonVariantes } from "@/components/ui/button";
import { PANTALLAS, type Pantalla } from "@/lib/areas";
import { Enlace } from "@/lib/navegacion";

/**
 * Lo que ve alguien del equipo que llega a una pantalla que su rol no abre (por un enlace guardado, o porque el dueño
 * le acaba de cambiar los permisos). Explica por qué y lo devuelve al inicio, en vez de mostrarle algo a medias.
 * Sirve también en la app sin conexión (usa Enlace, no next/link).
 */
export function SinPermiso({ pantalla }: { pantalla: Pantalla }) {
  const p = PANTALLAS[pantalla];
  return (
    <>
      <EncabezadoPantalla titulo={p.titulo} atras="/inicio" />
      <main className="pb-nav flex flex-col items-start gap-4 px-4 pt-6">
        <Lock className="size-10" aria-hidden />
        <h2 className="font-display text-4xl font-extrabold uppercase leading-none">No tienes permiso</h2>
        <p className="text-lg text-tinta-2">
          {p.pide === "dueno"
            ? `Solo el dueño puede ${p.accion}.`
            : `Para ${p.accion} hace falta un permiso que tu rol no tiene. Si lo necesitas, pídeselo al dueño.`}
        </p>
        <Enlace href="/inicio" className={botonVariantes({ tamano: "lg", bloque: true })}>
          Volver al inicio
        </Enlace>
      </main>
    </>
  );
}
