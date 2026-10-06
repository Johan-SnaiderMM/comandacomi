"use client";

import { ClipboardList, Ellipsis, House, NotebookPen, Plus, type LucideIcon } from "lucide-react";
import { Enlace, useRuta } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

type Item = { href: string; etiqueta: string; Icono: LucideIcon; central?: boolean; /** Otras rutas que cuentan como "esta pestaña". */ tambien?: string[] };

const ITEMS: Item[] = [
  { href: "/inicio", etiqueta: "Inicio", Icono: House },
  { href: "/pedidos", etiqueta: "Pendientes", Icono: ClipboardList },
  { href: "/pedido/nuevo", etiqueta: "Tomar", Icono: Plus, central: true },
  { href: "/fiado", etiqueta: "Fiado", Icono: NotebookPen },
  { href: "/mas", etiqueta: "Más", Icono: Ellipsis, tambien: ["/gastos", "/menu"] },
];

/**
 * Barra de navegación inferior (zona del pulgar). Cinco destinos de 72 px de alto; el central
 * ("Tomar pedido") es la acción más frecuente y sobresale. La pestaña activa se marca con relleno
 * amarillo Y con `aria-current`, no solo con color.
 */
export function BarraNavegacion({ pendientes = 0 }: { pendientes?: number }) {
  const ruta = useRuta();

  return (
    <nav
      aria-label="Principal"
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--ancho-app)] -translate-x-1/2 border-t-2 border-tinta bg-papel pb-[var(--seguro-abajo)]"
    >
      <ul className="grid h-[var(--nav-h)] grid-cols-5">
        {ITEMS.map(({ href, etiqueta, Icono, central, tambien }) => {
          const activo = [href, ...(tambien ?? [])].some((r) => ruta === r || (r !== "/inicio" && ruta.startsWith(`${r}/`)));
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
