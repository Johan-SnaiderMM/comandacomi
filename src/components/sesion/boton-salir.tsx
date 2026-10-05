"use client";

import { LogOut } from "lucide-react";
import { salirDemo } from "@/app/acciones/sesion";

/** Salir de la demo. Antes borra las copias guardadas por el service worker (tienen datos del restaurante). */
export function BotonSalir({ className }: { className?: string }) {
  return (
    <form
      action={salirDemo}
      onSubmit={() => {
        if ("caches" in window) void caches.keys().then((claves) => Promise.all(claves.map((c) => caches.delete(c))));
      }}
    >
      <button type="submit" className={className}>
        <LogOut className="size-6 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Salir de la demo</span>
      </button>
    </form>
  );
}
