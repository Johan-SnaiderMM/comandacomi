/**
 * Texto de cada aviso push (lógica pura, con pruebas). Cortos y concretos: se leen en la pantalla bloqueada.
 */
import { formatearPesos } from "@/lib/dinero";
import { destinoDePedido } from "@/lib/plancha";
import type { Aviso, InfoPedidoAviso } from "./tipos";

const NBSP = " ";
/** "$ 37.000" con el espacio duro, para que el importe no se parta en dos renglones. */
const pesos = (v: number) => formatearPesos(v).replace(" ", NBSP);

function destino(info: InfoPedidoAviso): string {
  return destinoDePedido({
    tipo: info.tipo ?? "llevar",
    mesa: info.mesa ?? null,
    contacto_nombre: info.contacto_nombre ?? null,
    origen: info.origen ?? "mostrador",
  });
}

/** Al dueño: llegó un pedido de un cliente. */
export function avisoPedidoNuevo(p: { numero: number; tipo: "llevar" | "domicilio"; total: number }): Aviso {
  return {
    titulo: `¡Pedido nuevo! #${p.numero}`,
    cuerpo: `${p.tipo === "domicilio" ? "Domicilio" : "Recoge en el local"} · ${pesos(p.total)}. Toca para aceptarlo.`,
    url: "/pedidos",
    etiqueta: "pedido-nuevo",
    urgente: true,
  };
}

/** A la parrilla: hay un pedido nuevo para preparar. */
export function avisoALaPlancha(info: InfoPedidoAviso): Aviso {
  return {
    titulo: `A la plancha: #${info.numero}`,
    cuerpo: `${destino(info)}. Toca para ver los platos.`,
    url: "/plancha",
    etiqueta: `plancha-${info.numero}`,
    urgente: true,
  };
}

/**
 * A la parrilla: a un pedido que ya estaba le agregaron platos ("la mesa pidió más"). Lleva la misma etiqueta que el
 * aviso de ese pedido: en el celular lo reemplaza (y vuelve a sonar) en vez de apilarse.
 */
export function avisoPlatosAgregados(info: InfoPedidoAviso): Aviso {
  return {
    titulo: `Más platos: #${info.numero}`,
    cuerpo: `${destino(info)}. Le agregaron platos al pedido.`,
    url: "/plancha",
    etiqueta: `plancha-${info.numero}`,
    urgente: true,
  };
}

/** Al mesero: el pedido quedó listo para entregar. */
export function avisoPedidoListo(info: InfoPedidoAviso): Aviso {
  return {
    titulo: `Listo para entregar: #${info.numero}`,
    cuerpo: `${destino(info)}. Ya se puede llevar.`,
    url: "/pedidos",
    etiqueta: `listo-${info.numero}`,
    urgente: true,
  };
}

/** Al cliente: el restaurante aceptó su pedido. */
export function avisoClienteAceptado(info: InfoPedidoAviso, minutos: number | null): Aviso {
  return {
    titulo: `${info.restaurante ?? "Tu pedido"}: pedido aceptado`,
    cuerpo: minutos ? `Tu pedido #${info.numero} está en preparación. Listo en unos ${minutos} min.` : `Tu pedido #${info.numero} está en preparación.`,
    url: `/seguimiento/${info.token}`,
    etiqueta: `cliente-${info.numero}`,
  };
}

/** Al cliente: su pedido quedó listo. */
export function avisoClienteListo(info: InfoPedidoAviso): Aviso {
  const domicilio = info.tipo === "domicilio";
  return {
    titulo: `¡Tu pedido #${info.numero} está listo!`,
    cuerpo: domicilio ? `${info.restaurante ?? "El restaurante"} lo envía a tu dirección en un momento.` : `Ya puedes pasar a recogerlo en ${info.restaurante ?? "el restaurante"}.`,
    url: `/seguimiento/${info.token}`,
    etiqueta: `cliente-${info.numero}`,
    urgente: true,
  };
}

/** Al cliente: el restaurante no pudo atender su pedido. */
export function avisoClienteRechazado(info: InfoPedidoAviso, motivo: string): Aviso {
  return {
    titulo: `Tu pedido #${info.numero} no pudo atenderse`,
    cuerpo: `${motivo}. Puedes volver a pedir.`,
    url: `/seguimiento/${info.token}`,
    etiqueta: `cliente-${info.numero}`,
  };
}

/** Prueba desde "Avisos en este celular". */
export function avisoDePrueba(): Aviso {
  return {
    titulo: "Avisos activados",
    cuerpo: "Así te llegarán los pedidos, aunque la app esté cerrada.",
    url: "/mas",
    etiqueta: "prueba",
  };
}
