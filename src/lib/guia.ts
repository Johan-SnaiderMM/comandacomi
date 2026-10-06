/**
 * Recorrido guiado de la demo. Sin librerías: una lista de pasos, un estado mínimo (el paso actual, guardado en
 * sessionStorage para que sobreviva a los cambios de pantalla) y un resaltado del botón que hay que tocar.
 *
 * Cliente y servidor pueden importar este archivo: no usa Zod ni nada del servidor.
 */

export type PasoGuia = {
  titulo: string;
  texto: string;
  /** Dónde ocurre el paso (la hoja ofrece "Llévame" si el usuario está en otra pantalla). */
  ruta: RegExp;
  /** A dónde llevar al usuario si no está en `ruta`. */
  ir: string;
  /** Elemento que se resalta: el primero con `data-guia="<objetivo>"`. */
  objetivo?: string;
  /** Si el usuario llega a esta ruta tocando lo que se le pidió, la guía avanza sola al paso siguiente. */
  alLlegarA?: RegExp;
};

export const PASOS: readonly PasoGuia[] = [
  {
    titulo: "Así va tu día",
    texto: "De un vistazo: cuánto vendiste, cuánto gastaste y cuánto ganas. Todo se calcula solo.",
    ruta: /^\/inicio$/,
    ir: "/inicio",
    objetivo: "resumen",
  },
  {
    titulo: "Toma un pedido",
    texto: "Toca el botón amarillo «Tomar» de abajo.",
    ruta: /^\/inicio$|^\/pedidos$|^\/fiado$|^\/mas$/,
    ir: "/inicio",
    objetivo: "tomar",
    alLlegarA: /^\/pedido\/nuevo$/,
  },
  {
    titulo: "Arma el pedido",
    texto: "Elige la mesa, toca los platos que pide el cliente y pulsa «Enviar a cocina».",
    ruta: /^\/pedido\/nuevo$/,
    ir: "/pedido/nuevo",
    objetivo: "plato",
    alLlegarA: /^\/pedidos$/,
  },
  {
    titulo: "Sigue el pedido",
    texto: "Cuando esté listo toca «Marcar listo», luego «Entregado» y después «Cobrar».",
    ruta: /^\/pedidos$/,
    ir: "/pedidos",
    objetivo: "avanzar",
    alLlegarA: /^\/pedidos\/[^/]+\/cobrar$/,
  },
  {
    titulo: "Cobra",
    texto:
      "Efectivo (con teclado y vuelto), Nequi, o fiado si el cliente paga después. Prueba cobrar en efectivo: al terminar, la guía sigue sola.",
    ruta: /^\/pedidos\/[^/]+\/cobrar$/,
    ir: "/pedidos",
    alLlegarA: /^\/fiado/,
  },
  {
    titulo: "Quién te debe",
    texto: "Cada cliente que debe tiene dos botones: «Recordar» abre WhatsApp con el mensaje listo y «Abonar» registra un pago.",
    ruta: /^\/fiado/,
    ir: "/fiado",
    objetivo: "recordar",
    alLlegarA: /^\/gastos/,
  },
  {
    titulo: "Anota los gastos",
    texto: "Carne, pan, gas… se anotan en tres toques y hasta con foto del recibo. Así sabes cuánto ganas de verdad.",
    ruta: /^\/gastos/,
    ir: "/gastos",
    alLlegarA: /^\/cierre$/,
  },
  {
    titulo: "Cierra el día",
    texto: "Cuenta el efectivo de la caja: la app te dice si cuadra, cuánto ganaste y arma el resumen para mandarlo por WhatsApp.",
    ruta: /^\/cierre$/,
    ir: "/cierre",
    alLlegarA: /^\/mas$/,
  },
  {
    titulo: "Listo",
    texto: "Eso es todo. En «Más → Reiniciar demo» vuelven los datos de ejemplo para la próxima visita.",
    ruta: /^\/mas$/,
    ir: "/mas",
  },
];

/** Paso al que debe pasar la guía cuando el usuario llega a `ruta` estando en `paso` (o el mismo si no corresponde). */
export function pasoTrasNavegar(paso: number, ruta: string): number {
  const actual = PASOS[paso];
  return actual?.alLlegarA?.test(ruta) ? paso + 1 : paso;
}

export function pasoEnRuta(paso: number, ruta: string): boolean {
  return PASOS[paso]?.ruta.test(ruta) ?? false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Estado compartido (useSyncExternalStore). `abierta` solo vive en memoria; `paso` también en sessionStorage.
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoGuia = { paso: number; abierta: boolean } | null;

const CLAVE = "guia-paso";
let estado: EstadoGuia = null;
let cargado = false;
const oyentes = new Set<() => void>();

function emitir(nuevo: EstadoGuia) {
  estado = nuevo;
  try {
    if (nuevo) sessionStorage.setItem(CLAVE, String(nuevo.paso));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin sessionStorage (ventana privada, datos bloqueados): la guía sigue en memoria.
  }
  oyentes.forEach((o) => o());
}

export function suscribirGuia(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function leerGuia(): EstadoGuia {
  if (!cargado) {
    cargado = true;
    try {
      const guardado = sessionStorage.getItem(CLAVE);
      const n = guardado === null ? NaN : Number(guardado);
      if (Number.isInteger(n) && n >= 0 && n < PASOS.length) estado = { paso: n, abierta: false };
    } catch {
      // ver arriba
    }
  }
  return estado;
}

export const leerGuiaServidor = (): EstadoGuia => null;

export function iniciarGuia() {
  emitir({ paso: 0, abierta: true });
}
export function irAPaso(paso: number) {
  if (paso >= PASOS.length) emitir(null);
  else emitir({ paso: Math.max(0, paso), abierta: true });
}
/** Si la guía está en `paso`, pasa al siguiente (lo usan las pantallas que saben que el usuario ya hizo lo pedido). */
export function avanzarDesde(paso: number) {
  if (leerGuia()?.paso === paso) irAPaso(paso + 1);
}
export function abrirGuia() {
  const actual = leerGuia();
  if (actual) emitir({ ...actual, abierta: true });
}
export function cerrarGuia() {
  const actual = leerGuia();
  if (actual?.abierta) emitir({ ...actual, abierta: false });
}
export function terminarGuia() {
  if (leerGuia()) emitir(null);
}
