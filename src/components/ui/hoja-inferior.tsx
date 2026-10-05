"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type Props = {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
};

/**
 * Hoja inferior (bottom sheet) sobre <dialog> nativo: foco atrapado, tecla Atrás/Esc y fondo táctil
 * sin ninguna librería. Se monta solo cuando está abierta (`{abierta && <HojaInferior …/>}`), así
 * su contenido se reinicia cada vez. El pulgar alcanza el botón de cerrar y las acciones de abajo.
 */
export function HojaInferior({ titulo, onCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        // Toque en el fondo oscuro (fuera del contenido) cierra.
        if (e.target === ref.current) ref.current?.close();
      }}
      className="hoja fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[92dvh] w-full max-w-[var(--ancho-app)] overflow-y-auto rounded-t-3xl border-2 border-b-0 border-tinta bg-papel p-0 text-tinta backdrop:bg-tinta/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-2 border-tinta bg-papel px-4 py-2">
        <h2 className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight">{titulo}</h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Cerrar"
          className="tap flex items-center justify-center rounded-full active:bg-tinta/10"
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div className="px-4 pt-4 pb-[calc(1.25rem+var(--seguro-abajo))]">{children}</div>
    </dialog>
  );
}
