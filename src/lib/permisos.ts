import "server-only";
import { puedeVer, quienEs, type Pantalla } from "@/lib/areas";
import { obtenerContexto } from "@/lib/datos/inicio";

/**
 * Quién entra y si puede ver esta pantalla. Cada página del personal lo revisa al empezar y, si no, muestra
 * <SinPermiso>. La base de datos igual rechaza lo que no le toca a cada quien: esto es para no mostrarle una pantalla
 * a medias (vacía o con botones que van a fallar).
 */
export async function revisarPermiso(pantalla: Pantalla) {
  const contexto = await obtenerContexto();
  const quien = quienEs(contexto);
  return { contexto, quien, permitido: puedeVer(quien, pantalla) };
}
