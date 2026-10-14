"use client";

import { ChefHat, ClipboardList, Ellipsis, House, NotebookPen, Plus, Smartphone, type LucideIcon } from "lucide-react";
import { AREAS, pestanasDe, type Pestana, type Quien } from "@/lib/areas";
import { Enlace, useRuta } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

type Item = { href: string; etiqueta: string; Icono: LucideIcon; central?: boolean };

const ITEMS: Record<Pestana, Item> = {
  inicio: { href: "/inicio", etiqueta: "Inicio", Icono: House },
  pendientes: { href: "/pedidos", etiqueta: "Pendientes", Icono: ClipboardList },
  tomar: { href: "/pedido/nuevo", etiqueta: "Tomar", Icono: Plus, central: true },
  enLinea: { href: "/pedidos-en-linea", etiqueta: "En línea", Icono: Smartphone },
  plancha: { href: "/plancha", etiqueta: "Plancha", Icono: ChefHat },
  fiado: { href: "/fiado", etiqueta: "Fiado", Icono: NotebookPen },
  mas: { href: "/mas", etiqueta: "Más", Icono: Ellipsis },
};

/** Pantallas que viven dentro de "Más": con una de ellas abierta, la pestaña marcada es Más (si no tiene la suya). */
const DENTRO_DE_MAS = ["/gastos", "/menu", "/mesas", "/fiado", "/equipo"];

/** Mientras no se sabe quién es (no debería pasar), la barra de siempre. */
const TODO: Quien = { areas: [...AREAS], esDueno: false };

/**
 * Barra de navegación inferior (zona del pulgar). Hasta cinco destinos de 72 px de alto; el central ("Tomar pedido")
 * es la acción más frecuente y sobresale. La pestaña activa se marca con relleno amarillo Y con `aria-current`, no
 * solo con color.
 *
 * Las pestañas dependen de lo que abre quien entra (ver `pestanasDe`): el dueño y el mesero ven Inicio, Pendientes,
 * Tomar, En línea y Más; la cocina, Inicio, Plancha y Más. `sinConexion`: en la app sin conexión (/sc) la cuarta es
 * Fiado, porque los pedidos en línea necesitan señal y el fiado sí se trabaja sin ella.
 */
export function BarraNavegacion({ pendientes = 0, sinConexion = false, quien = TODO }: { pendientes?: number; sinConexion?: boolean; quien?: Quien }) {
  const ruta = useRuta();
  const pestanas = pestanasDe(quien, sinConexion).map((p) => ITEMS[p]);
  const enBarra = pestanas.map((i) => i.href);

  return (
    <nav
      aria-label="Principal"
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--ancho-app)] -translate-x-1/2 border-t-2 border-tinta bg-papel pb-[var(--seguro-abajo)]"
    >
      <ul className="grid h-[var(--nav-h)]" style={{ gridTemplateColumns: `repeat(${pestanas.length}, minmax(0, 1fr))` }}>
        {pestanas.map(({ href, etiqueta, Icono, central }) => {
          const propias = href === "/mas" ? [href, ...DENTRO_DE_MAS.filter((r) => !enBarra.includes(r))] : [href];
          const activo = propias.some((r) => ruta === r || (r !== "/inicio" && ruta.startsWith(`${r}/`)));
          return (
            <li key={href} className="relative">
              <Enlace
                href={href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold leading-none",
                  !central && (activo ? "bg-sol text-tinta" : "text-tinta-2 active:bg-tinta/10")
                )}
              >
                {central ? (
                  <span data-guia="tomar" className="-mt-7 flex size-16 items-center justify-center rounded-full border-2 border-tinta bg-sol text-tinta shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none">
                    <Icono className="size-8" strokeWidth={3} aria-hidden />
                  </span>
                ) : (
                  <span className="relative">
                    <Icono className="size-6" strokeWidth={activo ? 2.75 : 2.25} aria-hidden />
                    {etiqueta === "Pendientes" && pendientes > 0 && (
                      <span className="absolute -top-2 -right-3 flex min-w-5 items-center justify-center rounded-full border-2 border-tinta bg-aji px-1 text-[0.7rem] font-extrabold leading-4 text-papel">
                        {pendientes > 99 ? "99+" : pendientes}
                      </span>
                    )}
                  </span>
                )}
                <span className={cn(central && "font-extrabold text-tinta")}>{etiqueta}</span>
              </Enlace>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
