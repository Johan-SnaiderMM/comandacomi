import { notFound } from "next/navigation";
import { verPedidoPublico } from "@/lib/datos/publico";
import { esquemaTokenSeguimiento } from "@/lib/esquemas/publico";
import { SeguimientoPedido } from "./seguimiento-pedido";

/** Pestaña y manifiesto del restaurante del pedido (así, agregarlo a la pantalla de inicio abre su panel de pedir). */
export async function generateMetadata({ params }: PageProps<"/seguimiento/[token]">) {
  const { token } = await params;
  if (!esquemaTokenSeguimiento.safeParse(token).success) return { title: "Tu pedido" };
  const seguimiento = await verPedidoPublico(token).catch(() => null);
  if (!seguimiento) return { title: "Tu pedido" };
  return {
    title: `Tu pedido en ${seguimiento.restaurante.nombre}`,
    manifest: `/pedir/${seguimiento.restaurante.slug}/manifest.webmanifest`,
  };
}

/**
 * Seguimiento de un pedido por su código secreto. Es público: quien tiene el enlace ve ESE pedido (nunca otros).
 * La primera carga viene del servidor; después la pantalla se actualiza sola (ver seguimiento-pedido.tsx).
 */
export default async function PaginaSeguimiento({ params }: PageProps<"/seguimiento/[token]">) {
  const { token } = await params;
  if (!esquemaTokenSeguimiento.safeParse(token).success) notFound();
  const inicial = await verPedidoPublico(token);
  if (!inicial) notFound();
  return <SeguimientoPedido token={token} inicial={inicial} />;
}
