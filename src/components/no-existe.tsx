"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Flame, House } from "lucide-react";
import { botonVariantes, Button } from "@/components/ui/button";
import { MARCA } from "@/lib/marca";
import { zonaDeRuta, type ZonaDeRuta } from "@/lib/rutas-publicas";

const sinSuscripcion = () => () => {};

/** Qué se le dice a cada quien. Al cliente nunca se le manda al inicio de la app del personal. */
const TEXTOS: Record<ZonaDeRuta, { titulo: string; texto: string; pedido: string; resultado: string }> = {
  personal: {
    titulo: "Esta pantalla no está en el menú",
    texto: "Puede que el enlace esté mal escrito o que la pantalla ya no exista. No se perdió nada de lo guardado.",
    pedido: "Pediste",
    resultado: "No existe",
  },
  pedir: {
    titulo: "Este enlace ya no está disponible",
    texto: "Puede que el restaurante haya cambiado su enlace para pedir, o que esté mal escrito. Pídele el enlace nuevo o vuelve a escanear su código QR.",
    pedido: "Enlace",
    resultado: "Ya no está",
  },
  seguimiento: {
    titulo: "No encontramos ese pedido",
    texto: "El enlace puede estar incompleto, o el pedido es de hace mucho. Si acabas de pedir, vuelve al enlace del restaurante: ahí aparece tu pedido en curso.",
    pedido: "Buscaste",
    resultado: "No aparece",
  },
};

/**
 * La única pantalla de "no existe": cambia el texto según a quién le habla (a un cliente nunca lo manda a la app del
 * personal). `data-pantalla="no-existe"` frena la sincronización, que aquí confundiría el fallo con falta de señal.
 */
export function PantallaNoExiste() {
  const ruta = usePathname();
  const zona = zonaDeRuta(ruta);
  const t = TEXTOS[zona];
  // "Volver atrás" solo sirve si hay un atrás (quien abre el enlace desde WhatsApp llega sin historial).
  const hayAtras = useSyncExternalStore(sinSuscripcion, () => window.history.length > 1, () => false);
  // De un pedido no se muestra la dirección (lleva su código); de lo demás sí, para ver qué se escribió mal.
  const pedido = zona === "seguimiento" ? "Tu pedido" : ruta;

  return (
    <main data-pantalla="no-existe" className="columna-app flex flex-col px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      {zona === "personal" && (
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-lg border-2 border-tinta bg-sol shadow-sello-chico">
            <Flame className="size-6" strokeWidth={2.75} aria-hidden />
          </span>
          <span className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">{MARCA.nombre}</span>
        </div>
      )}

      <div className="my-auto py-4">
        <p className="cifra text-[4.5rem] text-aji" aria-hidden>
          404
        </p>
        <h1 className="font-display mt-1 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight">{t.titulo}</h1>
        <p className="mt-3 text-lg leading-snug text-tinta-2">{t.texto}</p>

        {/* La firma de la app: el tiquete. Aquí, el de una comanda que la cocina devuelve. */}
        <section aria-label="Lo que se pidió" className="tiquete mt-4 border-2 border-b-0 border-tinta px-4 pb-4 pt-3">
          <p className="text-base font-bold uppercase tracking-wide text-tinta-2">Comanda devuelta</p>
          <dl className="mt-2 text-lg">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0">{t.pedido}</dt>
              <dd className="min-w-0 truncate font-bold" title={pedido}>
                {pedido}
              </dd>
            </div>
            <hr className="separador-punteado my-3" />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-bold">Resultado</dt>
              <dd className="cifra text-4xl text-aji">{t.resultado}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="space-y-2">
        {zona === "personal" && (
          <Link href="/inicio" className={botonVariantes({ tamano: "lg", bloque: true })}>
            <House className="size-5" aria-hidden /> Ir al inicio
          </Link>
        )}
        {hayAtras && (
          <Button variante="secundario" tamano="lg" bloque onClick={() => window.history.back()}>
            <ArrowLeft className="size-5" aria-hidden /> Volver atrás
          </Button>
        )}
      </div>
    </main>
  );
}
