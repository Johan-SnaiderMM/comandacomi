import Link from "next/link";
import { Flame } from "lucide-react";
import { botonVariantes } from "@/components/ui/button";
import { inicioDe, quienEs } from "@/lib/areas";
import { obtenerContexto } from "@/lib/datos/inicio";
import { MARCA } from "@/lib/marca";
import { obtenerUsuario } from "@/lib/sesion";
import { FormularioClave } from "./formulario-clave";

export const metadata = { title: "Entrar a mi restaurante" };

/**
 * Entrada del dueño de un restaurante DE VERDAD, con su correo y su contraseña (la demo entra con un toque desde la
 * portada, y el equipo con su código en /unirme). La cuenta la crea quien instala la app (ver README).
 */
export default async function Entrar() {
  const usuario = await obtenerUsuario().catch(() => null);
  const contexto = usuario ? await obtenerContexto().catch(() => null) : null;
  const ayuda = MARCA.contactoWhatsapp
    ? `https://wa.me/${MARCA.contactoWhatsapp}?text=${encodeURIComponent(`Hola, olvidé la contraseña de ${MARCA.nombre}.`)}`
    : null;

  return (
    <div className="columna-app flex flex-col px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="flex items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-lg border-2 border-tinta bg-sol shadow-sello-chico">
          <Flame className="size-6" strokeWidth={2.75} aria-hidden />
        </span>
        <span className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">{MARCA.nombre}</span>
      </div>

      {contexto?.perfil && contexto.restaurante ? (
        <>
          <h1 className="font-display mt-7 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight">Ya estás dentro</h1>
          <p className="mt-3 text-lg leading-snug text-tinta-2">
            Este celular es de <strong className="text-tinta">{contexto.perfil.nombre}</strong> en {contexto.restaurante.nombre}. Para entrar con otra
            cuenta, primero sal (Más → Salir).
          </p>
          <Link href={inicioDe(quienEs(contexto))} className={`${botonVariantes({ tamano: "lg", bloque: true })} mt-6`}>
            Abrir la app
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display mt-7 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight">Entrar a mi restaurante</h1>
          <p className="mt-3 text-lg leading-snug text-tinta-2">Con el correo y la contraseña que te dieron al instalar la app.</p>
          <div className="mt-6">
            <FormularioClave />
          </div>
          <div className="mt-6 space-y-2">
            {ayuda ? (
              <a href={ayuda} target="_blank" rel="noopener noreferrer" className={botonVariantes({ variante: "fantasma", bloque: true })}>
                Olvidé mi contraseña
              </a>
            ) : (
              <p className="text-center text-base text-tinta-2">¿Olvidaste la contraseña? Pídele una nueva a quien te instaló la app.</p>
            )}
            <Link href="/unirme" className={botonVariantes({ variante: "secundario", bloque: true })}>
              Trabajo aquí: tengo un código
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
