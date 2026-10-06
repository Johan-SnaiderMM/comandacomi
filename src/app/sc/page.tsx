import { AppSinConexion } from "./app-sin-conexion";

export const metadata = { title: "Sin conexión" };

/**
 * La app sin conexión (ver app-sin-conexion.tsx). Es una página estática y sin sesión a propósito: el service worker
 * la guarda y la sirve cuando no hay señal; lo que muestra sale de la copia local del celular.
 */
export default function PaginaSinConexion() {
  return <AppSinConexion />;
}
