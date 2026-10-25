/**
 * Motor sin conexión: cola de operaciones que se sube EN ORDEN, cada una con su clave para que un reintento no la repita.
 * Un rechazo de la base queda "fallida" para que alguien lo revise; un fallo de red o pasajero se reintenta solo.
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

/**
 * Cuántas veces se reintenta sola una operación que el servidor no pudo atender por un fallo pasajero. Al pasarse queda
 * "fallida" para que una persona la revise: así un fallo que en realidad no era pasajero no tranca la fila para siempre.
 */
export const MAX_FALLOS_SERVIDOR = 10;

/** Sube una operación. Si lanza, se trata como fallo de red y se reintenta más tarde. */
export type Transporte = (op: Operacion) => Promise<RespuestaOperacion>;

export type EstadoMotor = {
  snapshot: Snapshot | null;
  ops: OperacionEnCola[];
  sincronizando: boolean;
  /** El último intento de hablar con el servidor falló: por la red, o porque el servidor no pudo atender. */
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
  /** Alguien pidió subir mientras ya había una subida en marcha: al terminar se da otra pasada. */
  private otraPasada = false;
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

  // Lectura

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

  // Operaciones

  /**
   * Con señal y la cola vacía, manda directo; si no, encola con la misma clave (`pendiente: true`). Tras un fallo
   * (`sinRed`) ni prueba: guarda de una vez, así con mala señal solo el primer toque espera.
   */
  async ejecutar<T extends TipoOperacion>(tipo: T, datos: DatosOperacion[T]): Promise<ResultadoEjecucion> {
    const op = { clave: this.nuevoId(), tipo, datos, ocurridoEn: this.ahora().toISOString() } as Operacion;

    if (this.deps.enLinea() && !this.est.sinRed) {
      if (this.porSubir() > 0) await this.vaciar(); // no saltarse la fila
      if (this.porSubir() === 0) {
        try {
          const r = await this.deps.transporte(op);
          if (r.ok) {
            this.cambiar({ sinRed: false, sinSesion: false });
            void this.refrescar();
            return { ok: true, pendiente: false, datos: r.datos };
          }
          if (r.sinSesion) this.cambiar({ sinSesion: true });
          else if (r.reintentable) this.cambiar({ sinRed: true });
          else {
            this.cambiar({ sinRed: false });
            return { ok: false, error: r.error };
          }
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

  // Sincronizar

  /**
   * Sube lo pendiente, en orden. Si ya hay una subida en marcha, espera a esa (y, si quedó algo que esa no alcanzó a
   * ver, se da otra pasada al terminar: lo guardado a último momento no se queda esperando a la próxima revisión).
   */
  vaciar(): Promise<void> {
    if (this.vaciando) {
      this.otraPasada = true;
      return this.vaciando;
    }
    this.vaciando = this.subirHastaTerminar();
    return this.vaciando;
  }

  private async subirHastaTerminar(): Promise<void> {
    try {
      do {
        this.otraPasada = false;
        await this.subir();
      } while (this.otraPasada && this.deps.enLinea() && !this.est.sinRed && !this.est.sinSesion && this.porSubir() > 0);
    } finally {
      // En el mismo instante en que se decide no dar otra pasada: un `vaciar()` que llegue después ya arranca una nueva
      // (si esto se soltara más tarde, ese pedido se quedaría esperando una subida que ya terminó).
      this.vaciando = null;
      this.cambiar({ sincronizando: false });
    }
  }

  private async subir(): Promise<void> {
    if (!this.deps.enLinea() || this.porSubir() === 0) return;
    this.cambiar({ sincronizando: true });

    let huboEnviadas = false;
    // Siempre la más vieja que falte (no una lista fija): lo que se guarda MIENTRAS se sube sale en esta misma pasada.
    // Cada vuelta deja la operación enviada o fallida, o corta la subida: nunca se repite la misma sin fin.
    for (let op = this.masViejaPendiente(); op; op = this.masViejaPendiente()) {
      this.marcar(op.clave, { intentos: op.intentos + 1 });
      let r: RespuestaOperacion;
      try {
        r = await this.deps.transporte(op);
      } catch {
        this.cambiar({ sinRed: true });
        return; // sin red: se queda todo como está y se reintenta después
      }
      if (r.ok) {
        this.cambiar({ sinRed: false });
        this.marcar(op.clave, { estado: "enviada", error: undefined, fallosServidor: undefined });
        huboEnviadas = true;
      } else if (r.sinSesion) {
        this.cambiar({ sinRed: false, sinSesion: true });
        return;
      } else if (r.reintentable && (op.fallosServidor ?? 0) + 1 < MAX_FALLOS_SERVIDOR) {
        // El servidor no pudo atender (no es culpa de la operación): se conserva y se reintenta, como sin señal.
        this.marcar(op.clave, { fallosServidor: (op.fallosServidor ?? 0) + 1 });
        this.cambiar({ sinRed: true });
        return;
      } else {
        this.cambiar({ sinRed: false });
        this.marcar(op.clave, { estado: "fallida", error: r.error });
      }
    }
    this.cambiar({ sinSesion: false });
    if (huboEnviadas || this.est.ops.some((o) => o.estado === "enviada")) await this.refrescar();
  }

  private masViejaPendiente(): OperacionEnCola | undefined {
    return this.est.ops.find((o) => o.estado === "pendiente");
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

  // Revisar lo que falló

  reintentar(clave: string): void {
    this.marcar(clave, { estado: "pendiente", error: undefined, intentos: 0, fallosServidor: undefined });
    void this.vaciar();
  }

  descartar(clave: string): void {
    this.cambiar({ ops: this.est.ops.filter((o) => o.clave !== clave) });
  }

  /** Vuelve a leer lo guardado cuando otra pestaña lo cambió. No escribe nada (para no pisar a la otra). */
  recargarDesdeAlmacen(): void {
    const cola = this.leerCola();
    this.siguienteLocal = Math.max(this.siguienteLocal, cola.siguienteLocal);
    this.ultimaLocalGuardada = this.siguienteLocal;
    this.est = { ...this.est, snapshot: this.leerSnapshot(), ops: cola.ops };
    this.avisar();
  }

  /** Borra la copia y la cola (al salir de la sesión). */
  limpiarTodo(): void {
    this.siguienteLocal = 1;
    this.deps.almacen.borrar(CLAVE_SNAPSHOT);
    this.deps.almacen.borrar(CLAVE_COLA);
    this.est = { snapshot: null, ops: [], sincronizando: false, sinRed: false, sinSesion: false };
    this.avisar();
  }

  // Interno

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
