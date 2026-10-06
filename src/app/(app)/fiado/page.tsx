import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { listarClientes } from "@/lib/datos/fiado";
import { obtenerContexto } from "@/lib/datos/inicio";
import { hoyBogota } from "@/lib/fechas";
import { ListaFiado } from "./lista-fiado";

export const metadata = { title: "Fiado" };

export default async function Fiado() {
  const [clientes, contexto] = await Promise.all([listarClientes(), obtenerContexto()]);
  return (
    <>
      <EncabezadoPantalla titulo="Fiado" />
      <main className="pb-nav">
        <ListaFiado
          clientes={clientes}
          hoy={hoyBogota()}
          restaurante={contexto.restaurante?.nombre ?? "tu restaurante"}
        />
      </main>
    </>
  );
}
