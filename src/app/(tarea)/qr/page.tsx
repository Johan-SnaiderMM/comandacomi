import { redirect } from "next/navigation";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { obtenerContexto } from "@/lib/datos/inicio";
import { CartelQr } from "./cartel-qr";

export const metadata = { title: "QR para imprimir" };

/** Cartel con el código QR del enlace para pedir, listo para imprimir o guardar como imagen. */
export default async function PaginaQr() {
  const contexto = await obtenerContexto();
  if (!contexto.restaurante?.slug) redirect("/pedidos-en-linea");
  return (
    <>
      <div className="no-imprimir">
        <EncabezadoPantalla titulo="QR para imprimir" atras="/pedidos-en-linea" />
      </div>
      <main className="pb-8">
        <CartelQr slug={contexto.restaurante.slug} nombre={contexto.restaurante.nombre} />
      </main>
    </>
  );
}
