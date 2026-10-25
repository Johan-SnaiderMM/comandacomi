/**
 * Sonidos y vibración de los avisos, generados con la Web Audio API (sin archivos). El navegador solo deja sonar tras un
 * toque, por eso `activarSonido()` va en un evento táctil.
 */

type Patron = "pedido-nuevo" | "plato-listo";

// [frecuencia Hz, inicio s, duración s]
const NOTAS: Record<Patron, [number, number, number][]> = {
  "pedido-nuevo": [
    [880, 0, 0.16],
    [1175, 0.2, 0.16],
    [880, 0.45, 0.16],
    [1175, 0.65, 0.32],
  ],
  "plato-listo": [
    [660, 0, 0.12],
    [880, 0.15, 0.22],
  ],
};

const VIBRACION: Record<Patron, number[]> = {
  "pedido-nuevo": [350, 150, 350, 150, 700],
  "plato-listo": [150, 80, 150],
};

let contexto: AudioContext | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  oyentes.forEach((f) => f());
}

function crearContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto) return contexto;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    contexto = new Constructor();
    contexto.addEventListener("statechange", avisar);
  } catch {
    contexto = null;
  }
  return contexto;
}

/** Desbloquea el audio (llamar desde un toque). Quien quiera saber si ya puede sonar usa `sonidoActivo`. */
export function activarSonido(): void {
  const c = crearContexto();
  if (!c) return;
  c.resume().then(avisar, avisar);
  avisar();
}

export function sonidoActivo(): boolean {
  return contexto?.state === "running";
}

/**
 * Desbloquea el audio con el primer toque en cualquier parte. Escucha `click`, no `pointerdown`: llega después del toque,
 * así si el aviso de "activar sonido" desaparece y la pantalla se corre, el botón tocado ya recibió su toque.
 */
export function desbloquearConElPrimerToque(): () => void {
  const alTocar = () => {
    if (!sonidoActivo()) activarSonido();
  };
  document.addEventListener("click", alTocar);
  return () => document.removeEventListener("click", alTocar);
}

/** Para `useSyncExternalStore(suscribirSonido, sonidoActivo, …)`. */
export function suscribirSonido(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Toca el patrón si el audio está desbloqueado (si no, no hace nada: no es un error). */
export function tocar(patron: Patron): void {
  const c = contexto;
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime;
  for (const [frecuencia, inicio, duracion] of NOTAS[patron]) {
    const oscilador = c.createOscillator();
    const volumen = c.createGain();
    oscilador.type = "square";
    oscilador.frequency.value = frecuencia;
    // ataque y caída cortos: sin "clic" al empezar ni al terminar
    volumen.gain.setValueAtTime(0.0001, t0 + inicio);
    volumen.gain.exponentialRampToValueAtTime(0.18, t0 + inicio + 0.015);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + duracion);
    oscilador.connect(volumen).connect(c.destination);
    oscilador.start(t0 + inicio);
    oscilador.stop(t0 + inicio + duracion + 0.02);
  }
}

export function vibrar(patron: Patron): void {
  try {
    navigator.vibrate?.(VIBRACION[patron]);
  } catch {
    // no todos los aparatos vibran
  }
}
