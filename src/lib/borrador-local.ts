/**
 * El pedido a medio armar, guardado en el celular. Antes vivía solo en la pantalla: tocar la alerta de un pedido nuevo,
 * una notificación, la flecha de volver o recargar lo borraba. Ahora vive aquí (en memoria y en el almacenamiento del
 * celular), así se puede salir de la pantalla y retomarlo.
 *
 * Reglas:
 *  - Se vence: pasado `vigenciaMs` desde el último cambio se descarta (un pedido viejo no debe aparecer solo).
 *  - `extra` (para el personal: para quién es el pedido) solo se conserva si hay platos. Un destino elegido sin platos
 *    no se arrastra al pedido siguiente: se volvería a mandar a la mesa equivocada sin darse cuenta.
 *  - Al enviar el pedido se llama `olvidar()`.
 *
 * Sin React: se lee con `useSyncExternalStore(a.suscribir, a.leer, () => a.vacio)`. En el servidor siempre está vacío.
 */
import { BORRADOR_VACIO, reducir, type Accion, type Borrador, type LineaBorrador } from "@/lib/pedido-borrador";
import { almacenLocal, type Almacen } from "@/lib/sync/almacen";

export type BorradorGuardado<E> = { borrador: Borrador; extra: E };

export type AlmacenBorrador<E> = {
  /** Estado actual. Devuelve el mismo objeto mientras nada cambie. */
  leer(): BorradorGuardado<E>;
  /** El estado vacío (lo que ve el servidor y la primera pintura en el celular). */
  vacio: BorradorGuardado<E>;
  suscribir(oyente: () => void): () => void;
  despachar(accion: Accion): void;
  ponerExtra(extra: E): void;
  /** Borra todo: platos y extra. */
  olvidar(): void;
};

export type OpcionesBorrador<E> = {
  /** Nombre con el que se guarda en el celular. */
  clave: string;
  extraInicial: E;
  vigenciaMs: number;
  /** Valida lo guardado en `extra` (viene de un texto del celular: puede estar dañado). null = no sirve. */
  leerExtra?: (crudo: unknown) => E | null;
  almacen?: Almacen;
  ahora?: () => number;
};

const texto = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function esLinea(v: unknown): v is LineaBorrador {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    texto(l.clave) &&
    texto(l.productoId) &&
    texto(l.nombre) &&
    texto(l.notas) &&
    entero(l.precio, 0, 100_000_000) &&
    entero(l.cantidad, 1, 99) &&
    Array.isArray(l.adiciones) &&
    l.adiciones.every((a) => typeof a === "object" && a !== null && texto((a as Record<string, unknown>).id) && texto((a as Record<string, unknown>).nombre) && entero((a as Record<string, unknown>).precio, 0, 100_000_000))
  );
}

export function crearAlmacenBorrador<E>(opciones: OpcionesBorrador<E>): AlmacenBorrador<E> {
  const { clave, extraInicial, vigenciaMs } = opciones;
  const ahora = opciones.ahora ?? (() => Date.now());
  const vacio: BorradorGuardado<E> = { borrador: BORRADOR_VACIO, extra: extraInicial };
  const oyentes = new Set<() => void>();
  let disco: Almacen | null = opciones.almacen ?? null;
  let estado = vacio;
  let tocado = 0;
  let cargado = false;

  const almacen = () => (disco ??= almacenLocal());
  const avisar = () => oyentes.forEach((o) => o());

  function guardar() {
    if (estado.borrador.lineas.length === 0 && estado.extra === extraInicial) almacen().borrar(clave);
    else almacen().escribir(clave, JSON.stringify({ v: 1, at: tocado, lineas: estado.borrador.lineas, extra: estado.extra }));
  }

  function cargar() {
    if (cargado) return;
    cargado = true;
    const crudo = almacen().leer(clave);
    if (!crudo) return;
    try {
      const g = JSON.parse(crudo) as { v?: unknown; at?: unknown; lineas?: unknown; extra?: unknown };
      const sirve = g.v === 1 && typeof g.at === "number" && ahora() - g.at <= vigenciaMs && Array.isArray(g.lineas) && g.lineas.length > 0 && g.lineas.every(esLinea);
      if (!sirve) {
        almacen().borrar(clave);
        return;
      }
      const extra = opciones.leerExtra ? (opciones.leerExtra(g.extra) ?? extraInicial) : extraInicial;
      estado = { borrador: { lineas: g.lineas as LineaBorrador[] }, extra };
      tocado = g.at as number;
    } catch {
      almacen().borrar(clave);
    }
  }

  function poner(nuevo: BorradorGuardado<E>) {
    estado = nuevo;
    tocado = ahora();
    guardar();
    avisar();
  }

  return {
    vacio,
    leer() {
      cargar();
      // Vencido en memoria (la app quedó abierta en otra pantalla): se descarta igual que al leerlo del celular.
      if (estado !== vacio && ahora() - tocado > vigenciaMs) {
        estado = vacio;
        almacen().borrar(clave);
      }
      return estado;
    },
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
        // Se salió de la pantalla sin platos: el destino elegido no se guarda para el pedido siguiente.
        if (oyentes.size === 0 && estado !== vacio && estado.borrador.lineas.length === 0) {
          estado = vacio;
          almacen().borrar(clave);
        }
      };
    },
    despachar(accion) {
      cargar();
      const borrador = reducir(estado.borrador, accion);
      // El reductor devuelve un objeto nuevo aunque no cambie nada: se comparan las líneas para no repintar ni guardar de más.
      const antes = estado.borrador.lineas;
      const igual = borrador.lineas.length === antes.length && borrador.lineas.every((l, i) => l === antes[i]);
      if (!igual) poner({ ...estado, borrador });
    },
    ponerExtra(extra) {
      cargar();
      poner({ ...estado, extra });
    },
    olvidar() {
      cargado = true;
      estado = vacio;
      almacen().borrar(clave);
      avisar();
    },
  };
}

/** Prefijo de todo lo que este archivo guarda en el celular. */
export const PREFIJO_BORRADOR = "borrador:";

const abiertos = new Map<string, AlmacenBorrador<unknown>>();

/**
 * El almacén de un borrador, uno solo por clave en cada pestaña (así sobrevive a cambiar de pantalla). En el servidor
 * devuelve uno desechable y vacío: allí no hay celular donde guardar y nada debe compartirse entre personas.
 */
export function almacenBorrador<E>(opciones: OpcionesBorrador<E>): AlmacenBorrador<E> {
  const clave = PREFIJO_BORRADOR + opciones.clave;
  if (typeof window === "undefined") return crearAlmacenBorrador({ ...opciones, clave, almacen: { leer: () => null, escribir: () => {}, borrar: () => {} } });
  let a = abiertos.get(clave) as AlmacenBorrador<E> | undefined;
  if (!a) {
    a = crearAlmacenBorrador({ ...opciones, clave });
    abiertos.set(clave, a as AlmacenBorrador<unknown>);
  }
  return a;
}

/** Borra los borradores guardados cuya clave empieza por `prefijo` (al salir de la sesión: son datos del restaurante). */
export function olvidarBorradores(prefijo: string): void {
  const inicio = PREFIJO_BORRADOR + prefijo;
  for (const [clave, a] of abiertos) {
    if (clave.startsWith(inicio)) a.olvidar();
  }
  try {
    const sobran: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(inicio)) sobran.push(k);
    }
    sobran.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // sin almacenamiento no hay nada que borrar
  }
}
