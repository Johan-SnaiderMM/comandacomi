/**
 * Avisos push (notificaciones con la app cerrada). Solo tipos y constantes: los usa el navegador y el servidor.
 * El envío (con la llave privada) vive en servidor.ts; la forma de la base está en la migración 11.
 */

/** A qué avisos puede suscribirse un celular del personal. */
export const CANALES_PERSONAL = ["pedidos", "cocina", "listos"] as const;
export type CanalPersonal = (typeof CANALES_PERSONAL)[number];

export const TEXTOS_CANAL: Record<CanalPersonal, { titulo: string; detalle: string }> = {
  pedidos: { titulo: "Pedidos nuevos de clientes", detalle: "Para el dueño: llegó un pedido por aceptar" },
  cocina: { titulo: "Pedidos a la plancha", detalle: "Para la parrilla: hay platos por preparar" },
  listos: { titulo: "Pedidos listos", detalle: "Para el mesero: un pedido está listo para entregar" },
};

/** Lo que viaja en la notificación (el service worker lo muestra tal cual). */
export type Aviso = {
  titulo: string;
  cuerpo: string;
  /** Ruta que abre al tocar la notificación. */
  url: string;
  /** Misma etiqueta = reemplaza a la anterior en vez de apilarse. */
  etiqueta: string;
  /** Pedidos nuevos: la notificación se queda hasta que la toquen y vibra más. */
  urgente?: boolean;
};

/** Celular al que se le manda el aviso (lo que devuelve la base para el servidor). */
export type Destino = { endpoint: string; p256dh: string; auth: string };

/** La suscripción tal como la entrega el navegador (`PushSubscription.toJSON()`). */
export type SuscripcionJson = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Datos de un pedido para armar un aviso + los celulares de su cliente (listar_destinos_push_pedido). */
export type InfoPedidoAviso = {
  token: string | null;
  numero: number | null;
  tipo?: "mesa" | "llevar" | "domicilio";
  estado?: "pendiente" | "listo" | "entregado";
  origen?: "mostrador" | "cliente";
  mesa?: string | null;
  contacto_nombre?: string | null;
  restaurante: string | null;
  destinos: Destino[];
};
