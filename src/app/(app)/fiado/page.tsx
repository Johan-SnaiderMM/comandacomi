import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { listarClientes } from "@/lib/datos/fiado";
import { obtenerContexto } from "@/lib/datos/inicio";
import { hoyDeTrabajo } from "@/lib/fechas";
import { ListaFiado } from "./lista-fiado";

export const metadata = { title: "Fiado" };

export default async function Fiado() {
  const [clientes, contexto] = await Promise.all([listarClientes(), obtenerContexto()]);
  return (
    <>
      <EncabezadoPantalla titulo="Fiado" atras="/mas" />
      <main className="pb-nav">
        <ListaFiado
          clientes={clientes}
          hoy={hoyDeTrabajo(new Date(), contexto.restaurante?.hora_corte)}
          restaurante={contexto.restaurante?.nombre ?? "tu restaurante"}
        />
      </main>
    </>
  );
}
