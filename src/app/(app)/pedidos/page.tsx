import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { ActualizadorEnVivo } from "@/components/layout/actualizador-en-vivo";
import { listarPedidosPorConfirmar } from "@/lib/datos/clientes";
import { obtenerContexto } from "@/lib/datos/inicio";
import { listarPedidosCobradosHoy, listarPedidosPendientes } from "@/lib/datos/pedidos";
import { ListaPendientes } from "./lista-pendientes";
import { PedidosPorConfirmar } from "./por-confirmar";

export const metadata = { title: "Pendientes" };

export default async function Pendientes({ searchParams }: PageProps<"/pedidos">) {
  const sp = await searchParams;
  const numero = typeof sp.enviado === "string" ? Number(sp.enviado) : NaN;
  const enviado = Number.isInteger(numero) && numero !== 0 ? { numero, agregado: sp.agregado === "1", pendiente: sp.pendiente === "1" } : null;

  const [pendientes, cobrados, porConfirmar, contexto] = await Promise.all([
    listarPedidosPendientes(),
    listarPedidosCobradosHoy(),
    // Si la base todavía no tiene la actualización de pedidos en línea, Pendientes sigue funcionando como siempre.
    listarPedidosPorConfirmar().catch(() => []),
    obtenerContexto(),
  ]);
  const ahora = new Date().toISOString();

  return (
    <>
      <EncabezadoPantalla titulo="Pendientes" />
      <main className="pb-nav">
        <PedidosPorConfirmar pedidos={porConfirmar} ahora={ahora} restaurante={contexto.restaurante?.nombre ?? "el restaurante"} />
        <ListaPendientes
          pendientes={pendientes}
          cobrados={cobrados}
          ahora={ahora}
          enviado={enviado}
          restaurante={contexto.restaurante?.nombre ?? "el restaurante"}
        />
        <ActualizadorEnVivo cadaMs={8000} />
      </main>
    </>
  );
}
