import { notFound, redirect } from "next/navigation";
import { obtenerMenuPublico } from "@/lib/datos/publico";
import { urlFotoPlato } from "@/lib/fotos";
import { leerHorario, textoProximaApertura } from "@/lib/horario";
import type { MenuPublico } from "@/lib/publico/tipos";
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

/** A cada plato con foto se le arma aquí, en el servidor, la dirección para mostrarla. */
function conFotos(menu: MenuPublico): MenuPublico {
  return { ...menu, productos: menu.productos.map((p) => ({ ...p, foto_url: urlFotoPlato(p.foto) })) };
}

/**
 * Panel del cliente: el menú del restaurante y el pedido. Es público: sin cuenta ni contraseña. Un enlace que no
 * existe muestra la pantalla de "no existe".
 *
 * Un enlace ANTERIOR del restaurante (cambió de nombre) sigue sirviendo: la base lo encuentra y aquí se pasa al
 * vigente. La redirección es temporal a propósito: si el local vuelve a su nombre de antes, ese enlace vuelve a ser el
 * bueno, y un navegador que hubiera guardado una redirección "para siempre" quedaría dando vueltas.
 *
 * Si está cerrado por horario, "cuándo abre" se calcula aquí (una sola vez, en el servidor) y viaja como texto: así
 * no depende del reloj del celular del cliente.
 */
export default async function PaginaPedir({ params }: PageProps<"/pedir/[slug]">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  if (menu.restaurante.slug !== slug) redirect(`/pedir/${menu.restaurante.slug}`);
  const horario = leerHorario(menu.restaurante.horario);
  const cerradoPorHorario = !menu.restaurante.abierto && menu.restaurante.recibe !== false && horario !== null;
  return <PedirEnLinea menu={conFotos(menu)} horario={horario} apertura={cerradoPorHorario ? textoProximaApertura(horario, new Date()) : null} />;
}
