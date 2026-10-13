/**
 * El pedido que se está armando en pantalla (antes de enviarlo a cocina): lógica pura, sin React.
 * Respuesta inmediata al tocar: todo ocurre en el celular; el servidor recalcula precios al enviar.
 */
import { subtotalLinea, totalPedido, type Pesos } from "@/lib/dinero";
import type { TipoPedido } from "@/lib/datos/tipos";

export type AdicionElegida = { id: string; nombre: string; precio: Pesos };

export type LineaBorrador = {
  /** Identifica "el mismo plato con las mismas adiciones y nota": dos toques seguidos suman cantidad. */
  clave: string;
  productoId: string;
  nombre: string;
  precio: Pesos;
  cantidad: number;
  adiciones: AdicionElegida[];
  notas: string;
};

export type Borrador = { lineas: LineaBorrador[] };

export type Destino = {
  tipo: TipoPedido;
  mesaId: string | null;
  /** Si la mesa ya tiene un pedido abierto y se eligió agregarle platos. */
  agregarA: string | null;
  contactoNombre: string;
  contactoTelefono: string;
  direccion: string;
};

export const BORRADOR_VACIO: Borrador = { lineas: [] };
export const DESTINO_INICIAL: Destino = { tipo: "mesa", mesaId: null, agregarA: null, contactoNombre: "", contactoTelefono: "", direccion: "" };

/** Lee un destino guardado en el celular (texto que pudo dañarse): devuelve null si no tiene la forma esperada. */
export function leerDestino(crudo: unknown): Destino | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const d = crudo as Record<string, unknown>;
  const textoONulo = (v: unknown) => v === null || typeof v === "string";
  if (d.tipo !== "mesa" && d.tipo !== "llevar" && d.tipo !== "domicilio") return null;
  if (!textoONulo(d.mesaId) || !textoONulo(d.agregarA)) return null;
  if (typeof d.contactoNombre !== "string" || typeof d.contactoTelefono !== "string" || typeof d.direccion !== "string") return null;
  return {
    tipo: d.tipo,
    mesaId: d.mesaId as string | null,
    agregarA: d.agregarA as string | null,
    contactoNombre: d.contactoNombre,
    contactoTelefono: d.contactoTelefono,
    direccion: d.direccion,
  };
}

export const MAX_CANTIDAD = 99;

export function claveLinea(productoId: string, adicionIds: string[], notas: string): string {
  return [productoId, [...adicionIds].sort().join(","), notas.trim().toLowerCase()].join("|");
}

export type Accion =
  | { tipo: "agregar"; producto: { id: string; nombre: string; precio: Pesos }; adiciones?: AdicionElegida[]; notas?: string; cantidad?: number }
  | { tipo: "cambiar"; clave: string; delta: number }
  | { tipo: "quitar"; clave: string }
  | { tipo: "vaciar" }
  | { tipo: "restaurar"; borrador: Borrador };

export function reducir(estado: Borrador, accion: Accion): Borrador {
  switch (accion.tipo) {
    case "agregar": {
      const adiciones = accion.adiciones ?? [];
      const notas = (accion.notas ?? "").trim();
      const cantidad = accion.cantidad ?? 1;
      const clave = claveLinea(accion.producto.id, adiciones.map((a) => a.id), notas);
      const existe = estado.lineas.find((l) => l.clave === clave);
      if (existe) {
        return {
          lineas: estado.lineas.map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + cantidad) } : l)),
        };
      }
      return {
        lineas: [
          ...estado.lineas,
          {
            clave,
            productoId: accion.producto.id,
            nombre: accion.producto.nombre,
            precio: accion.producto.precio,
            cantidad: Math.min(MAX_CANTIDAD, cantidad),
            adiciones,
            notas,
          },
        ],
      };
    }
    case "cambiar":
      return {
        lineas: estado.lineas
          .map((l) => (l.clave === accion.clave ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + accion.delta) } : l))
          .filter((l) => l.cantidad > 0),
      };
    case "quitar":
      return { lineas: estado.lineas.filter((l) => l.clave !== accion.clave) };
    case "vaciar":
      return BORRADOR_VACIO;
    case "restaurar":
      return accion.borrador;
  }
}

/** Lo que hace falta del menú para poner al día un pedido guardado (sirve el del personal y el del cliente). */
export type MenuParaBorrador = {
  productos: { id: string; categoria_id: string; nombre: string; precio: Pesos; disponible: boolean }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: Pesos }[];
};

/**
 * Pone al día un pedido que se guardó hace un rato con el menú de AHORA: quita los platos que ya no existen o se
 * agotaron y las adiciones que ya no aplican, y corrige nombres y precios. Así lo que se muestra al retomar el pedido
 * es lo que el servidor va a aceptar y cobrar. Si no cambió nada devuelve el mismo borrador.
 */
export function reconciliarConMenu(b: Borrador, menu: MenuParaBorrador): Borrador {
  let cambio = false;
  const lineas: LineaBorrador[] = [];
  for (const l of b.lineas) {
    const producto = menu.productos.find((p) => p.id === l.productoId);
    if (!producto || !producto.disponible) {
      cambio = true;
      continue;
    }
    const adiciones = l.adiciones.flatMap((a) => {
      const m = menu.modificadores.find((x) => x.id === a.id && (x.categoria_id === null || x.categoria_id === producto.categoria_id));
      return m ? [{ id: m.id, nombre: m.nombre, precio: m.precio_extra }] : [];
    });
    const igual =
      producto.nombre === l.nombre &&
      producto.precio === l.precio &&
      adiciones.length === l.adiciones.length &&
      adiciones.every((a, i) => a.nombre === l.adiciones[i].nombre && a.precio === l.adiciones[i].precio);
    if (igual) {
      lineas.push(l);
      continue;
    }
    cambio = true;
    // Al perder una adición puede quedar igual a otra línea del pedido: se suman en una sola.
    const clave = claveLinea(producto.id, adiciones.map((a) => a.id), l.notas);
    const i = lineas.findIndex((x) => x.clave === clave);
    if (i >= 0) lineas[i] = { ...lineas[i], cantidad: Math.min(MAX_CANTIDAD, lineas[i].cantidad + l.cantidad) };
    else lineas.push({ ...l, clave, nombre: producto.nombre, precio: producto.precio, adiciones });
  }
  return cambio ? { lineas } : b;
}

/** Cuántas unidades de un plato hay en el pedido (sumando todas sus variantes). */
export function cantidadDe(b: Borrador, productoId: string): number {
  return b.lineas.filter((l) => l.productoId === productoId).reduce((s, l) => s + l.cantidad, 0);
}

export function totalUnidades(b: Borrador): number {
  return b.lineas.reduce((s, l) => s + l.cantidad, 0);
}

export function subtotalDe(l: LineaBorrador): Pesos {
  return subtotalLinea({ precio: l.precio, cantidad: l.cantidad, adiciones: l.adiciones.map((a) => a.precio) });
}

export function totalBorrador(b: Borrador): Pesos {
  return totalPedido(b.lineas.map((l) => ({ precio: l.precio, cantidad: l.cantidad, adiciones: l.adiciones.map((a) => a.precio) })));
}

/** Lo que se manda al servidor: ids y cantidades, NUNCA precios (el servidor los lee de la base). */
export function aItemsDeEnvio(b: Borrador) {
  return b.lineas.map((l) => ({
    productoId: l.productoId,
    cantidad: l.cantidad,
    adiciones: l.adiciones.map((a) => a.id),
    notas: l.notas,
  }));
}

/** ¿Falta algo del destino para poder enviar? Devuelve el mensaje o null si está completo. */
export function faltaEnDestino(d: Destino): string | null {
  if (d.tipo === "mesa" && !d.mesaId) return "Elige la mesa.";
  if (d.tipo === "domicilio" && d.direccion.trim().length === 0) return "Escribe la dirección del domicilio.";
  return null;
}

/** Texto corto para el botón de destino: "Mesa 3", "Para llevar", "Domicilio". */
export function etiquetaDestino(d: Destino, nombreMesa: string | null): string {
  if (d.tipo === "mesa") return nombreMesa ? (d.agregarA ? `${nombreMesa} · agregar` : nombreMesa) : "Elegir mesa";
  if (d.tipo === "llevar") return d.contactoNombre.trim() ? `Llevar · ${d.contactoNombre.trim()}` : "Para llevar";
  return "Domicilio";
}

/** Notas rápidas más usadas: un toque en vez de escribir. */
export const NOTAS_RAPIDAS = ["Sin cebolla", "Sin salsa", "Sin hielo", "Poca sal", "Bien cocida", "Sin picante"];

/** Agrega o quita una nota rápida del texto de la nota. */
export function alternarNota(texto: string, nota: string): string {
  const partes = texto.split(",").map((p) => p.trim()).filter(Boolean);
  const i = partes.findIndex((p) => p.toLowerCase() === nota.toLowerCase());
  if (i >= 0) partes.splice(i, 1);
  else partes.push(nota);
  return partes.join(", ");
}
