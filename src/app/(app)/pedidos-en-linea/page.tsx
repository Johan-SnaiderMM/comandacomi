import { redirect } from "next/navigation";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Aviso } from "@/components/ui/aviso";
import { obtenerContexto } from "@/lib/datos/inicio";
import { abiertoPorHorario, leerHorario, textoProximaApertura } from "@/lib/horario";
import { PanelPedidosEnLinea } from "./panel-pedidos-en-linea";

export const metadata = { title: "Pedidos en línea" };

/**
 * Pedidos en línea: el enlace (y el código QR) para que los clientes pidan desde su celular, y el interruptor para
 * abrir o cerrar la recepción. Quien abre o cierra es el dueño.
 */
export default async function PaginaPedidosEnLinea() {
  const contexto = await obtenerContexto();
  if (!contexto.restaurante) redirect("/");
  // La base aún no trae la actualización de pedidos en línea (migración 10): se explica en vez de armar un enlace roto.
  if (!contexto.restaurante.slug) {
    return (
      <>
        <EncabezadoPantalla titulo="Pedidos en línea" />
        <main className="pb-nav px-4 pt-4">
          <Aviso tipo="error">
            Falta aplicar la actualización de la base de datos para recibir pedidos en línea. Pega el archivo{" "}
            <strong>20261005000010_pedidos_clientes.sql</strong> en el SQL Editor de Supabase.
          </Aviso>
        </main>
      </>
    );
  }
  // "¿Es hora de atención?" se decide aquí, una vez, con el reloj del servidor (no con el del celular).
  const horario = leerHorario(contexto.restaurante.horario);
  const ahora = new Date();
  const enHorario = abiertoPorHorario(horario, ahora);
  return (
    <>
      <EncabezadoPantalla titulo="Pedidos en línea" />
      <main className="pb-nav space-y-4 px-4 pt-4">
        <PanelPedidosEnLinea
          slug={contexto.restaurante.slug}
          nombre={contexto.restaurante.nombre}
          activo={contexto.restaurante.pedidos_en_linea}
          esDueno={contexto.perfil?.rol === "dueno"}
          esDemo={contexto.restaurante.es_demo}
          horario={horario}
          enHorario={enHorario}
          apertura={enHorario ? "" : textoProximaApertura(horario, ahora)}
        />
      </main>
    </>
  );
}
