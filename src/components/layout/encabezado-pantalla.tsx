import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ChipGuia } from "@/components/guia/chip-guia";

/**
 * Encabezado fijo arriba de cada pantalla: título corto en letra de letrero y, si la pantalla es de
 * una sola tarea, flecha para volver (48 px). `derecha` es para una acción secundaria.
 */
export function EncabezadoPantalla({
  titulo,
  atras,
  derecha,
}: {
  titulo: string;
  atras?: string;
  derecha?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-12 items-center gap-1 border-b-2 border-tinta bg-fondo px-2 pt-[env(safe-area-inset-top,0px)]">
      {atras && (
        <Link
          href={atras}
          aria-label="Volver"
          className="tap flex items-center justify-center rounded-full active:bg-tinta/10"
        >
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
        </Link>
      )}
      <h1 className={`font-display text-3xl font-extrabold uppercase leading-none tracking-tight ${atras ? "" : "pl-2"}`}>
        {titulo}
      </h1>
      <div className="ml-auto flex items-center gap-1">
        {derecha}
        <ChipGuia />
      </div>
    </header>
  );
}
