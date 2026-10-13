import { notFound, redirect } from "next/navigation";
import { obtenerMenuPublico } from "@/lib/datos/publico";
import { PedirEnLinea } from "./pedir-en-linea";

/**
 * Nombre del restaurante en la pestaña del navegador y manifiesto propio (para agregar el enlace a la pantalla de
 * inicio y que abra el panel de pedir, no la app del personal). No rompe si la base no contesta.
 */
export async function generateMetadata({ params }: PageProps<"/pedir/[slug]">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug).catch(() => null);
  if (!menu) return { title: "Pedir en línea" };
  const { nombre } = menu.restaurante;
  return {
    title: `Pedir en ${nombre}`,
    applicationName: nombre,
    manifest: `/pedir/${menu.restaurante.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: nombre, statusBarStyle: "default" as const },
  };
}

/**
 * Panel del cliente: el menú del restaurante y el pedido. Es público: sin cuenta ni contraseña. Un enlace que no
 * existe muestra la pantalla de "no existe".
 *
 * Un enlace ANTERIOR del restaurante (cambió de nombre) sigue sirviendo: la base lo encuentra y aquí se pasa al
 * vigente. La redirección es temporal a propósito: si el local vuelve a su nombre de antes, ese enlace vuelve a ser el
 * bueno, y un navegador que hubiera guardado una redirección "para siempre" quedaría dando vueltas.
 */
export default async function PaginaPedir({ params }: PageProps<"/pedir/[slug]">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  if (menu.restaurante.slug !== slug) redirect(`/pedir/${menu.restaurante.slug}`);
  return <PedirEnLinea menu={menu} />;
}
