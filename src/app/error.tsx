"use client";

import { Button } from "@/components/ui/button";

export default function ErrorGeneral({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="columna-app flex flex-col items-start justify-center gap-4 px-4">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none">Algo salió mal</h1>
      <p className="text-lg text-tinta-2">
        No se perdió nada de lo que ya estaba guardado. Revisa la señal e intenta de nuevo.
      </p>
      <Button tamano="lg" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
