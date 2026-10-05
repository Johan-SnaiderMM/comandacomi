import { exigirSesion } from "@/lib/sesion";

/**
 * Pantallas de UNA sola tarea (tomar pedido, cobrar…): sin barra de navegación para dar todo el espacio
 * al trabajo; se sale con la flecha de arriba. Exigen sesión.
 */
export default async function LayoutTarea({ children }: LayoutProps<"/">) {
  await exigirSesion();
  return <div className="columna-app">{children}</div>;
}
