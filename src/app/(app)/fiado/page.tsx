import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarClientes } from "@/lib/datos/fiado";
import { hoyDeTrabajo } from "@/lib/fechas";
import { revisarPermiso } from "@/lib/permisos";
import { ListaFiado } from "./lista-fiado";

export const metadata = { title: "Fiado" };

export default async function Fiado() {
  const { contexto, permitido } = await revisarPermiso("fiado");
  if (!permitido) return <SinPermiso pantalla="fiado" />;
  const clientes = await listarClientes();
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
