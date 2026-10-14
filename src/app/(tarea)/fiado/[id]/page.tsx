import { notFound } from "next/navigation";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerClienteFiado } from "@/lib/datos/fiado";
import { ErrorApp } from "@/lib/errores";
import { revisarPermiso } from "@/lib/permisos";
import { Ficha } from "./ficha";

export const metadata = { title: "Cliente" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaCliente({ params }: PageProps<"/fiado/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { contexto, permitido } = await revisarPermiso("fiado");
  if (!permitido) return <SinPermiso pantalla="fiado" />;

  let ficha;
  try {
    ficha = await obtenerClienteFiado(id);
  } catch (e) {
    if (e instanceof ErrorApp) notFound();
    throw e;
  }

  return (
    <>
      <EncabezadoPantalla titulo={ficha.cliente.nombre} atras="/fiado" />
      <main>
        <Ficha ficha={ficha} restaurante={contexto.restaurante?.nombre ?? "tu restaurante"} />
      </main>
    </>
  );
}
