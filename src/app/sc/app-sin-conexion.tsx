"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { BarraNavegacion } from "@/components/layout/barra-navegacion";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import type { ClienteFiado, PedidoDetalle, PedidoPendiente } from "@/lib/datos/tipos";
import { hoyDeTrabajo } from "@/lib/fechas";
import { ProveedorNavegacionSC, type NavegacionSC } from "@/lib/navegacion";
import { useVista } from "@/lib/sync/cliente";
import { numeroVisible } from "@/lib/sync/numero";
import { hashDeRuta, idDeCobro, parsearRuta } from "@/lib/sync/rutas";
import type { Snapshot } from "@/lib/sync/tipos";
import { ListaPendientes } from "../(app)/pedidos/lista-pendientes";
import { ListaFiado } from "../(app)/fiado/lista-fiado";
import { NuevoGasto } from "../(tarea)/gastos/nuevo/nuevo-gasto";
import { TomarPedido, type ModoAgregar } from "../(tarea)/pedido/nuevo/tomar-pedido";
import { Cobrar } from "../(tarea)/pedidos/[id]/cobrar/cobrar";
import { Cargando, GastoGuardado, InicioSC, MasSC, RequiereConexion, SinDatos, Sincronizacion } from "./pantallas";

const suscribirHash = (cambio: () => void) => {
  window.addEventListener("hashchange", cambio);
  return () => window.removeEventListener("hashchange", cambio);
};
const siempre = () => () => {};

/** Pedido de la copia local -> la forma que espera la pantalla de cobro. */
function detalleDe(p: PedidoPendiente): PedidoDetalle {
  return {
    pedido: {
      id: p.id,
      numero: p.numero,
      tipo: p.tipo,
      estado: p.estado,
      created_at: p.created_at,
      mesa: p.mesa,
      contacto_nombre: p.contacto_nombre,
      contacto_telefono: p.contacto_telefono,
      direccion: p.direccion,
      notas: p.notas,
      total: p.total,
      propina: 0,
      cobrado: p.cobrado,
      cobrado_at: null,
      anulado: false,
    },
    items: [],
    pagos: [],
  };
}

function modoAgregarDe(vista: Snapshot, id: string | null): ModoAgregar | null {
  const p = id ? vista.pendientes.find((x) => x.id === id) : null;
  if (!p || p.cobrado) return null;
  const donde = p.mesa ?? p.contacto_nombre ?? (p.tipo === "llevar" ? "Para llevar" : "Domicilio");
  return { pedidoId: p.id, numero: p.numero, tipo: p.tipo, etiqueta: `Pedido ${numeroVisible(p.numero)} · ${donde}` };
}

function NoEncontrado() {
  return (
    <>
      <EncabezadoPantalla titulo="Pedido" atras="/pedidos" />
      <main className="px-4 pt-6">
        <p className="text-lg">Este pedido ya no está en la copia guardada. Vuelve a Pendientes.</p>
      </main>
    </>
  );
}

/**
 * La app sin conexión: una sola página con su propia navegación por # que muestra los mismos componentes de la app
 * normal, pero alimentados con la copia local (y la cola encima) en vez de con el servidor. Sirve con y sin señal.
 */
export function AppSinConexion() {
  const hash = useSyncExternalStore(suscribirHash, () => window.location.hash, () => "");
  const listo = useSyncExternalStore(siempre, () => true, () => false);
  const vista = useVista();
  const { ruta, query } = useMemo(() => parsearRuta(hash), [hash]);

  const nav = useMemo<NavegacionSC>(
    () => ({
      ruta: hash.replace(/^#/, "") || "/inicio",
      hrefDe: hashDeRuta,
      ir(href, reemplazar) {
        const destino = hashDeRuta(href);
        if (reemplazar) window.location.replace(destino);
        else window.location.hash = destino.slice(1);
      },
    }),
    [hash]
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [ruta]);

  return <ProveedorNavegacionSC value={nav}>{pantalla()}</ProveedorNavegacionSC>;

  function pantalla() {
    if (!listo) return <Cargando />;
    if (ruta === "/requiere-conexion") return <RequiereConexion ruta={query.get("ruta") ?? "/inicio"} />;
    if (!vista) return ruta === "/sincronizacion" ? <Sincronizacion vista={null} /> : <SinDatos />;

    const restaurante = vista.contexto.restaurante?.nombre ?? "tu restaurante";
    const conBarra = (contenido: React.ReactNode) => (
      <div className="columna-app">
        {contenido}
        <BarraNavegacion pendientes={vista.pendientes.filter((p) => !(p.estado === "entregado" && p.cobrado)).length} />
      </div>
    );

    switch (ruta) {
      case "/pedidos": {
        const numero = Number(query.get("enviado"));
        const enviado = Number.isInteger(numero) && numero !== 0 ? { numero, agregado: query.get("agregado") === "1", pendiente: query.get("pendiente") === "1" } : null;
        return conBarra(
          <>
            <EncabezadoPantalla titulo="Pendientes" />
            <main className="pb-nav">
              <ListaPendientes
                pendientes={vista.pendientes}
                cobrados={vista.cobrados}
                ahora={new Date().toISOString()}
                enviado={enviado}
                restaurante={restaurante}
              />
            </main>
          </>
        );
      }
      case "/fiado":
        return conBarra(
          <>
            <EncabezadoPantalla titulo="Fiado" />
            <main className="pb-nav">
              <ListaFiado clientes={vista.clientes as ClienteFiado[]} hoy={hoyDeTrabajo(new Date(), vista.contexto.restaurante?.hora_corte)} restaurante={restaurante} />
            </main>
          </>
        );
      case "/mas":
        return conBarra(<MasSC vista={vista} />);
      case "/sincronizacion":
        return conBarra(<Sincronizacion vista={vista} />);
      case "/pedido/nuevo":
        return <TomarPedido menu={vista.menu} agregar={modoAgregarDe(vista, query.get("agregar"))} />;
      case "/gastos/nuevo":
        return <NuevoGasto />;
      case "/gastos": {
        const monto = Number(query.get("guardado"));
        if (Number.isInteger(monto) && monto > 0) return <GastoGuardado monto={monto} pendiente={query.get("pendiente") === "1"} />;
        return <RequiereConexion ruta="/gastos" />;
      }
      case "/inicio":
        return conBarra(<InicioSC vista={vista} />);
      default: {
        const id = idDeCobro(ruta);
        if (id) {
          const p = vista.pendientes.find((x) => x.id === id);
          return p ? <Cobrar detalle={detalleDe(p)} clientes={vista.clientes} /> : <NoEncontrado />;
        }
        if (ruta === "/") return conBarra(<InicioSC vista={vista} />);
        // Una pantalla de la app normal que no existe aquí (cierre, menú, ficha de cliente…): llegó por el # que arma
        // el service worker al faltar la señal. Se explica y se ofrece abrirla cuando haya conexión.
        const resto = query.toString();
        return <RequiereConexion ruta={resto ? `${ruta}?${resto}` : ruta} />;
      }
    }
  }
}
