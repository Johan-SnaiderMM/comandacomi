import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { ActualizadorEnVivo } from "@/components/layout/actualizador-en-vivo";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { abre } from "@/lib/areas";
import { listarPedidosPorConfirmar } from "@/lib/datos/clientes";
import { listarPedidosCobradosHoy, listarPedidosPendientes, obtenerHuella } from "@/lib/datos/pedidos";
import { revisarPermiso } from "@/lib/permisos";
import { ListaPendientes } from "./lista-pendientes";
import { PedidosPorConfirmar } from "./por-confirmar";

export const metadata = { title: "Pendientes" };

export default async function Pendientes({ searchParams }: PageProps<"/pedidos">) {
  const { contexto, quien, permitido } = await revisarPermiso("pendientes");
  if (!permitido) return <SinPermiso pantalla="pendientes" />;
  const sp = await searchParams;
  const numero = typeof sp.enviado === "string" ? Number(sp.enviado) : NaN;
  const enviado = Number.isInteger(numero) && numero !== 0 ? { numero, agregado: sp.agregado === "1", pendiente: sp.pendiente === "1" } : null;
  // Aceptar o rechazar los pedidos de clientes es de quien toma pedidos.
  const aceptaEnLinea = abre(quien, "pedidos");

  // La huella va primero (ver obtenerHuella): con ella la pantalla sabe si el pulso trae algo que no tiene.
  const huella = await obtenerHuella().catch(() => null);
  const [pendientes, cobrados, porConfirmar] = await Promise.all([
    listarPedidosPendientes(),
    listarPedidosCobradosHoy(),
    // Si la base todavía no tiene la actualización de pedidos en línea, Pendientes sigue funcionando como siempre.
    aceptaEnLinea ? listarPedidosPorConfirmar().catch(() => []) : [],
  ]);
  const ahora = new Date().toISOString();

  return (
    <>
      <EncabezadoPantalla titulo="Pendientes" />
      <main className="pb-nav">
        {aceptaEnLinea && <PedidosPorConfirmar pedidos={porConfirmar} ahora={ahora} restaurante={contexto.restaurante?.nombre ?? "el restaurante"} />}
        <ListaPendientes
          pendientes={pendientes}
          cobrados={cobrados}
          ahora={ahora}
          enviado={enviado}
          restaurante={contexto.restaurante?.nombre ?? "el restaurante"}
          quien={quien}
        />
        <ActualizadorEnVivo huella={huella} />
      </main>
    </>
  );
}
