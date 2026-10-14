import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { leerVerComo, puedeVer, quienEs, type Pantalla } from "@/lib/areas";
import { obtenerContexto } from "@/lib/datos/inicio";

/** Cookie de "Ver como" (solo de este celular; ver lib/areas.ts). */
export const COOKIE_VER_COMO = "ver_como";

/**
 * Quién entra (con el "Ver como" del dueño, si lo hay). Una sesión sin equipo (lo quitaron del equipo, o todavía no
 * canjea su código de invitación) va a /unirme: ahí se le explica y puede entrar con un código nuevo.
 */
export async function obtenerQuien() {
  const contexto = await obtenerContexto();
  if (!contexto.perfil) redirect("/unirme");
  const verComo = leerVerComo((await cookies()).get(COOKIE_VER_COMO)?.value);
  return { contexto, quien: quienEs(contexto, verComo) };
}

/**
 * Quién entra y si puede ver esta pantalla. Cada página del personal lo revisa al empezar y, si no, muestra
 * <SinPermiso>. La base de datos igual rechaza lo que no le toca a cada quien: esto es para no mostrarle una pantalla
 * a medias (vacía o con botones que van a fallar).
 */
export async function revisarPermiso(pantalla: Pantalla) {
  const { contexto, quien } = await obtenerQuien();
  return { contexto, quien, permitido: puedeVer(quien, pantalla) };
}
