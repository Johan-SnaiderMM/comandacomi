/**
 * Motor del trabajo sin conexión: guarda la copia local y la cola de operaciones, las ejecuta directo cuando hay
 * señal y las encola cuando no, y las sube en orden al volver la conexión.
 *
 * Reglas que lo hacen seguro:
 *  - Cada operación lleva una clave propia que el servidor recuerda: si la respuesta se pierde y se reintenta, no se
 *    repite (ver aplicar_operacion en la base).
 *  - Se suben en el MISMO orden en que ocurrieron (cobrar un pedido depende de haberlo creado).
 *  - Con operaciones pendientes, una nueva nunca se salta la fila: primero se vacía la cola.
 *  - Un rechazo del servidor (el plato ya no existe, el pedido ya estaba cobrado) no se reintenta: queda "fallida"
 *    con su motivo para que una persona la revise. Un fallo de red sí se reintenta.
 *
 * No depende de React ni del navegador: se prueba con un almacén en memoria y una red falsa.
 */
import type { Almacen } from "./almacen";
import type {
  DatosOperacion,
  EstadoCola,
  Operacion,
  OperacionEnCola,
  RespuestaOperacion,
  Snapshot,
  TipoOperacion,
} from "./tipos";
import { vistaDe } from "./vista";

export const CLAVE_SNAPSHOT = "sc:snapshot";
export const CLAVE_COLA = "sc:cola";

/** Sube una operación. Si lanza, se trata como fallo de red y se reintenta más tarde. */
export type Transporte = (op: Operacion) => Promise<RespuestaOperacion>;

export type EstadoMotor = {
  snapshot: Snapshot | null;
  ops: OperacionEnCola[];
  sincronizando: boolean;
  /** El último intento de hablar con el servidor falló por la red. */
  sinRed: boolean;
  /** El servidor dijo que no hay sesión: hay que volver a entrar para poder subir. */
  sinSesion: boolean;
};

export type DepsMotor = {
  almacen: Almacen;
  transporte: Transporte;
  /** Trae la copia fresca del servidor (null si no hay sesión). Lanza si no hay red. */
  descargarSnapshot: () => Promise<Snapshot | null>;
  /** ¿El aparato cree que hay red? (navigator.onLine). Un "sí" no garantiza nada: lo confirma el intento. */
  enLinea: () => boolean;
  ahora?: () => Date;
  nuevoId?: () => string;
};

export type ResultadoEjecucion =
  | { ok: true; pendiente: false; datos: unknown }
  | { ok: true; pendiente: true; op: OperacionEnCola }
  | { ok: false; error: string };

export class Motor {
  private est: EstadoMotor;
  private siguienteLocal = 1;
  private oyentes = new Set<() => void>();
  private vaciando: Promise<void> | null = null;
  private vistaCache: { de: EstadoMotor; vista: Snapshot | null } | null = null;
  private readonly ahora: () => Date;
  private readonly nuevoId: () => string;

  constructor(private readonly deps: DepsMotor) {
    this.ahora = deps.ahora ?? (() => new Date());
    this.nuevoId = deps.nuevoId ?? (() => crypto.randomUUID());
    this.est = { snapshot: this.leerSnapshot(), ops: [], sincronizando: false, sinRed: false, sinSesion: false };
    const cola = this.leerCola();
    this.siguienteLocal = cola.siguienteLocal;
    this.est = { ...this.est, ops: cola.ops };
  }

  // -------------------------------------------------------------------------------------------------- lectura

  estado(): EstadoMotor {
    return this.est;
  }

  suscribir(oyente: () => void): () => void {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  }

  /** La copia del servidor con la cola encima: lo que hay que mostrar. null si nunca se guardó una copia. */
  vista(): Snapshot | null {
    if (this.vistaCache?.de === this.est) return this.vistaCache.vista;
    const vista = this.est.snapshot ? vistaDe(this.est.snapshot, this.est.ops) : null;
    this.vistaCache = { de: this.est, vista };
    return vista;
  }

  porSubir(): number {
    return this.est.ops.filter((o) => o.estado === "pendiente").length;
  }

  conProblema(): OperacionEnCola[] {
    return this.est.ops.filter((o) => o.estado === "fallida");
  }

  // ------------------------------------------------------------------------------------------------ operaciones

  /**
   * Hace una operación: si hay señal y la cola está vacía la manda directo y devuelve el resultado real; si no hay
   * señal (o falla la red) la guarda en la cola con la misma clave y devuelve `pendiente: true`.
   * Un rechazo del servidor se devuelve como error: la persona lo ve y corrige, no se encola.
   */
  async ejecutar<T extends TipoOperacion>(tipo: T, datos: DatosOperacion[T]): Promise<ResultadoEjecucion> {
    const op = { clave: this.nuevoId(), tipo, datos, ocurridoEn: this.ahora().toISOString() } as Operacion;

    if (this.deps.enLinea()) {
      if (this.porSubir() > 0) await this.vaciar(); // no saltarse la fila
      if (this.porSubir() === 0) {
        try {
          const r = await this.deps.transporte(op);
          if (r.ok) {
            this.cambiar({ sinRed: false, sinSesion: false });
            void this.refrescar();
            return { ok: true, pendiente: false, datos: r.datos };
          }
          if (!r.sinSesion) {
            this.cambiar({ sinRed: false });
            return { ok: false, error: r.error };
          }
          this.cambiar({ sinSesion: true });
        } catch {
          this.cambiar({ sinRed: true });
        }
      }
    }

    const guardada = this.encolar(op);
    void this.vaciar();
    return { ok: true, pendiente: true, op: guardada };
  }

  private encolar(op: Operacion): OperacionEnCola {
    const numeroLocal = op.tipo === "crear_pedido" ? this.siguienteLocal++ : undefined;
    const enCola = { ...op, ...(numeroLocal ? { numeroLocal } : {}), estado: "pendiente", intentos: 0 } as OperacionEnCola;
    this.cambiar({ ops: [...this.est.ops, enCola] });
    return enCola;
  }

  // ------------------------------------------------------------------------------------------------ sincronizar

  /** Sube lo pendiente, en orden. Si ya hay una subida en marcha, espera a esa. */
  vaciar(): Promise<void> {
    if (this.vaciando) return this.vaciando;
    this.vaciando = this.subir().finally(() => {
      this.vaciando = null;
      this.cambiar({ sincronizando: false });
    });
    return this.vaciando;
  }

  private async subir(): Promise<void> {
    if (!this.deps.enLinea() || this.porSubir() === 0) return;
    this.cambiar({ sincronizando: true });

    let huboEnviadas = false;
    for (const op of this.est.ops.filter((o) => o.estado === "pendiente")) {
      this.marcar(op.clave, { intentos: op.intentos + 1 });
      let r: RespuestaOperacion;
      try {
        r = await this.deps.transporte(op);
      } catch {
        this.cambiar({ sinRed: true });
        return; // sin red: se queda todo como está y se reintenta después
      }
      this.cambiar({ sinRed: false });
      if (r.ok) {
        this.marcar(op.clave, { estado: "enviada", error: undefined });
        huboEnviadas = true;
      } else if (r.sinSesion) {
        this.cambiar({ sinSesion: true });
        return;
      } else {
        this.marcar(op.clave, { estado: "fallida", error: r.error });
      }
    }
    this.cambiar({ sinSesion: false });
    if (huboEnviadas || this.est.ops.some((o) => o.estado === "enviada")) await this.refrescar();
  }

  /**
   * Trae la copia fresca del servidor. Las operaciones ya aceptadas ("enviada") salen de la cola solo si la copia se
   * pidió DESPUÉS de que el servidor las aceptara: así la pantalla nunca ve un cambio desaparecer y volver.
   */
  async refrescar(): Promise<boolean> {
    if (!this.deps.enLinea()) return false;
    const aceptadas = new Set(this.est.ops.filter((o) => o.estado === "enviada").map((o) => o.clave));
    let nueva: Snapshot | null;
    try {
      nueva = await this.deps.descargarSnapshot();
    } catch {
      this.cambiar({ sinRed: true });
      return false;
    }
    if (!nueva) return false;
    this.cambiar({ sinRed: false, snapshot: nueva, ops: this.est.ops.filter((o) => !aceptadas.has(o.clave)) });
    return true;
  }

  // ------------------------------------------------------------------------------------- revisar lo que falló

  reintentar(clave: string): void {
    this.marcar(clave, { estado: "pendiente", error: undefined, intentos: 0 });
    void this.vaciar();
  }

  descartar(clave: string): void {
    this.cambiar({ ops: this.est.ops.filter((o) => o.clave !== clave) });
  }

  /** Borra la copia y la cola (al salir de la sesión). */
  limpiarTodo(): void {
    this.siguienteLocal = 1;
    this.deps.almacen.borrar(CLAVE_SNAPSHOT);
    this.deps.almacen.borrar(CLAVE_COLA);
    this.est = { snapshot: null, ops: [], sincronizando: false, sinRed: false, sinSesion: false };
    this.avisar();
  }

  // ---------------------------------------------------------------------------------------------------- interno

  private marcar(clave: string, cambios: Partial<OperacionEnCola>) {
    this.cambiar({ ops: this.est.ops.map((o) => (o.clave === clave ? ({ ...o, ...cambios } as OperacionEnCola) : o)) });
  }

  private cambiar(parcial: Partial<EstadoMotor>) {
    const antes = this.est;
    this.est = { ...antes, ...parcial };
    if (parcial.snapshot !== undefined && parcial.snapshot !== antes.snapshot) this.guardarSnapshot();
    if (parcial.ops !== undefined || this.siguienteLocal !== this.ultimaLocalGuardada) this.guardarCola();
    this.avisar();
  }

  private ultimaLocalGuardada = 1;

  private avisar() {
    this.oyentes.forEach((o) => o());
  }

  private guardarSnapshot() {
    if (this.est.snapshot) this.deps.almacen.escribir(CLAVE_SNAPSHOT, JSON.stringify(this.est.snapshot));
  }

  private guardarCola() {
    this.ultimaLocalGuardada = this.siguienteLocal;
    const cola: EstadoCola = { version: 1, siguienteLocal: this.siguienteLocal, ops: this.est.ops };
    this.deps.almacen.escribir(CLAVE_COLA, JSON.stringify(cola));
  }

  private leerSnapshot(): Snapshot | null {
    const crudo = this.deps.almacen.leer(CLAVE_SNAPSHOT);
    if (!crudo) return null;
    try {
      const s = JSON.parse(crudo) as Snapshot;
      return s?.version === 1 && s.menu && Array.isArray(s.pendientes) ? s : null;
    } catch {
      return null;
    }
  }

  private leerCola(): EstadoCola {
    const vacia: EstadoCola = { version: 1, siguienteLocal: 1, ops: [] };
    const crudo = this.deps.almacen.leer(CLAVE_COLA);
    if (!crudo) return vacia;
    try {
      const c = JSON.parse(crudo) as EstadoCola;
      if (c?.version !== 1 || !Array.isArray(c.ops)) return vacia;
      // Una subida interrumpida deja operaciones "enviada" sin confirmar: se conservan (se purgan al refrescar).
      return { version: 1, siguienteLocal: Number.isInteger(c.siguienteLocal) ? c.siguienteLocal : 1, ops: c.ops };
    } catch {
      return vacia;
    }
  }
}
