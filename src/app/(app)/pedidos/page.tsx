import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { listarPedidosCobradosHoy, listarPedidosPendientes } from "@/lib/datos/pedidos";
import { ListaPendientes } from "./lista-pendientes";

export const metadata = { title: "Pendientes" };

export default async function Pendientes({ searchParams }: PageProps<"/pedidos">) {
  const sp = await searchParams;
  const numero = typeof sp.enviado === "string" ? Number(sp.enviado) : NaN;
  const enviado = Number.isInteger(numero) && numero > 0 ? { numero, agregado: sp.agregado === "1" } : null;

  const [pendientes, cobrados] = await Promise.all([listarPedidosPendientes(), listarPedidosCobradosHoy()]);

  return (
    <>
      <EncabezadoPantalla titulo="Pendientes" />
      <main className="pb-nav">
        <ListaPendientes pendientes={pendientes} cobrados={cobrados} ahora={new Date().toISOString()} enviado={enviado} />
      </main>
    </>
  );
}
