import { notFound } from "next/navigation";
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
 */
export default async function PaginaPedir({ params }: PageProps<"/pedir/[slug]">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  return <PedirEnLinea menu={menu} />;
}
