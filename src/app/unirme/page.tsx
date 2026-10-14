import Link from "next/link";
import { Flame, UsersRound } from "lucide-react";
import { botonVariantes } from "@/components/ui/button";
import { inicioDe, quienEs } from "@/lib/areas";
import { obtenerContexto } from "@/lib/datos/inicio";
import { MARCA } from "@/lib/marca";
import { obtenerUsuario } from "@/lib/sesion";
import { FormularioUnirme } from "./formulario-unirme";

export const metadata = { title: "Unirme al equipo" };

/**
 * Unirse al equipo con el código que dio el dueño (Más → Equipo → Agregar a alguien). Se llega por el enlace o el QR
 * de la invitación (ya traen el código) o escribiéndolo. También llega aquí quien tiene sesión pero ya no está en
 * ningún equipo (el dueño lo quitó): se le explica y puede entrar con un código nuevo.
 */
export default async function Unirme({ searchParams }: PageProps<"/unirme">) {
  const sp = await searchParams;
  const codigo = typeof sp.codigo === "string" ? sp.codigo : "";
  const usuario = await obtenerUsuario().catch(() => null);
  const contexto = usuario ? await obtenerContexto().catch(() => null) : null;
  const perfil = contexto?.perfil ?? null;

  return (
    <div className="columna-app flex flex-col px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="flex items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-lg border-2 border-tinta bg-sol shadow-sello-chico">
          <Flame className="size-6" strokeWidth={2.75} aria-hidden />
        </span>
        <span className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">{MARCA.nombre}</span>
      </div>

      {perfil && contexto?.restaurante ? (
        <>
          <h1 className="font-display mt-7 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight">Ya estás en el equipo</h1>
          <p className="mt-3 text-lg leading-snug text-tinta-2">
            Este celular es de <strong className="text-tinta">{perfil.nombre}</strong> en {contexto.restaurante.nombre}.
            {codigo ? " Para usar otro código, primero sal de la app (Más → Salir)." : ""}
          </p>
          <Link href={inicioDe(quienEs(contexto))} className={`${botonVariantes({ tamano: "lg", bloque: true })} mt-6`}>
            Abrir la app
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display mt-7 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-tight">Únete a tu equipo</h1>
          <p className="mt-3 text-lg leading-snug text-tinta-2">
            Escribe el código que te dio el dueño. Desde este celular vas a entrar a la app sin correo ni contraseña.
          </p>
          {usuario && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border-2 border-dashed border-tinta/50 p-3 text-base">
              <UsersRound className="mt-0.5 size-5 shrink-0" aria-hidden />
              Este celular ya no está en ningún equipo. Pídele al dueño un código nuevo.
            </p>
          )}
          <div className="mt-6">
            <FormularioUnirme codigo={codigo} />
          </div>
          <p className="mt-4 text-center text-base text-tinta-2">Cada código sirve una sola vez y por 2 días.</p>
        </>
      )}
    </div>
  );
}
