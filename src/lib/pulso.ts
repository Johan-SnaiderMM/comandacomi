/**
 * El pulso: UNA consulta periódica por pestaña (`/api/pulso`: huella de los pedidos y resumen del aviso), compartida por
 * todo lo que está en vivo, al ritmo que piden las partes (lib/ritmo.ts). Con la pestaña oculta no pregunta.
 */
import type { ResumenPorConfirmar } from "@/lib/datos/tipos";
import { esperaSiguiente, ritmoCombinado, type Ritmo } from "@/lib/ritmo";

export type Pulso = { huella: string; porConfirmar: ResumenPorConfirmar | null };
export type FalloPulso = "sin-senal" | "sin-sesion";

export type Oyente = {
  /** El ritmo que necesita esta parte, según lo último que se supo. null = solo escucha (no pide consultas). */
  ritmo: (ultimo: Pulso | null) => Ritmo | null;
  alPulso?: (p: Pulso) => void;
  alFallar?: (f: FalloPulso) => void;
};

export type DepsPulso = {
  /** Devuelve el pulso, "sin-sesion" (401) o lanza si no hubo respuesta. */
  consultar: () => Promise<Pulso | "sin-sesion">;
  visible: () => boolean;
  ahora: () => number;
  programar: (fn: () => void, ms: number) => number;
  cancelar: (id: number) => void;
};

/** Dos pulsos con lo mismo: ni la huella ni el aviso cambiaron. */
function igual(a: Pulso | null, b: Pulso): boolean {
  if (!a || a.huella !== b.huella) return false;
  const x = a.porConfirmar;
  const y = b.porConfirmar;
  if (!x || !y) return x === y;
  return x.cantidad === y.cantidad && x.atiende === y.atiende && x.recientes.map((r) => r.id).join() === y.recientes.map((r) => r.id).join();
}

export class MotorPulso {
  private oyentes = new Set<Oyente>();
  private ultimoPulso: Pulso | null = null;
  private vueltasSinCambio = 0;
  private reloj: number | null = null;
  private toca = 0; // cuándo sale la próxima consulta (ms)
  private enCurso = false;
  private otraVez = false; // pidieron revisar mientras había una consulta en camino: su respuesta puede ser vieja
  private ultimaConsulta = -Infinity;
  private sinSesion = false;

  constructor(private deps: DepsPulso) {}

  ultimo(): Pulso | null {
    return this.ultimoPulso;
  }

  /** Empieza a escuchar. Si es el primero que pide consultas y todavía no se sabe nada, pregunta de una vez. */
  escuchar(oyente: Oyente): () => void {
    this.oyentes.add(oyente);
    if (this.ultimoPulso === null && oyente.ritmo(null) !== null) void this.latir();
    else this.programar();
    return () => {
      this.oyentes.delete(oyente);
      this.programar();
    };
  }

  /** Pregunta ya (algo pasó: otra pantalla cambió algo, volvió la señal o la pestaña volvió a estar a la vista). */
  revisarYa(): void {
    if (this.enCurso) this.otraVez = true;
    else void this.latir();
  }

  /** Alguien está usando la pantalla: el ritmo vuelve a ser rápido (sin preguntar de más ahora mismo). */
  actividad(): void {
    this.vueltasSinCambio = 0;
    const ritmo = this.ritmo();
    if (ritmo && this.reloj !== null && this.toca - this.deps.ahora() > ritmo.minMs) this.programar();
  }

  /** La pestaña volvió a estar a la vista: pregunta de una vez (si no acaba de preguntar). */
  alVolver(): void {
    if (!this.deps.visible()) return;
    const ritmo = this.ritmo();
    if (ritmo && this.deps.ahora() - this.ultimaConsulta >= Math.min(ritmo.minMs, 2_000)) this.revisarYa();
    else this.programar();
  }

  private ritmo(): Ritmo | null {
    return ritmoCombinado([...this.oyentes].map((o) => o.ritmo(this.ultimoPulso)));
  }

  private programar(): void {
    if (this.reloj !== null) this.deps.cancelar(this.reloj);
    this.reloj = null;
    const ritmo = this.ritmo();
    if (this.sinSesion || !ritmo || !this.deps.visible()) return;
    const espera = esperaSiguiente(ritmo, this.vueltasSinCambio);
    this.toca = this.deps.ahora() + espera;
    this.reloj = this.deps.programar(() => {
      this.reloj = null;
      void this.latir();
    }, espera);
  }

  private async latir(): Promise<void> {
    if (this.enCurso || this.sinSesion) return;
    if (!this.deps.visible() || this.ritmo() === null) return this.programar();
    this.enCurso = true;
    this.ultimaConsulta = this.deps.ahora();
    try {
      const r = await this.deps.consultar();
      if (r === "sin-sesion") {
        this.sinSesion = true; // la sesión venció: no se insiste (quien escucha decide qué hacer)
        this.oyentes.forEach((o) => o.alFallar?.("sin-sesion"));
        return;
      }
      this.vueltasSinCambio = igual(this.ultimoPulso, r) ? this.vueltasSinCambio + 1 : 0;
      this.ultimoPulso = r;
      this.oyentes.forEach((o) => o.alPulso?.(r));
    } catch {
      this.oyentes.forEach((o) => o.alFallar?.("sin-senal"));
    } finally {
      this.enCurso = false;
      if (this.otraVez && !this.sinSesion) {
        this.otraVez = false;
        void this.latir();
      } else {
        this.programar();
      }
    }
  }
}

let unico: MotorPulso | null = null;

/** El pulso de esta pestaña (null en el servidor). */
export function obtenerPulso(): MotorPulso | null {
  if (typeof window === "undefined") return null;
  if (unico) return unico;
  const motor = new MotorPulso({
    consultar: async () => {
      const r = await fetch("/api/pulso", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 401) return "sin-sesion";
      if (!r.ok) throw new Error("estado " + r.status);
      return (await r.json()) as Pulso;
    },
    visible: () => document.visibilityState === "visible",
    ahora: () => Date.now(),
    programar: (fn, ms) => window.setTimeout(fn, ms),
    cancelar: (id) => window.clearTimeout(id),
  });
  document.addEventListener("visibilitychange", () => motor.alVolver());
  window.addEventListener("online", () => motor.revisarYa());
  // Otra pantalla aceptó, rechazó o cambió algo de los pedidos en línea: se pregunta de una vez.
  window.addEventListener("clientes:cambio", () => motor.revisarYa());
  for (const evento of ["pointerdown", "keydown"]) window.addEventListener(evento, () => motor.actividad(), { capture: true, passive: true });
  unico = motor;
  return motor;
}
