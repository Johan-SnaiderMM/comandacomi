/**
 * Horario de atención de los pedidos en línea. Lógica pura (sin React, sin red, sin Zod): la usa también el navegador.
 *
 * Formato (igual que restaurantes.horario en la base): 7 posiciones, 0 = domingo … 6 = sábado; cada una es null (ese
 * día no se atiende) o { abre, cierra } en "HH:MM" de Bogotá. Si `cierra` es menor que `abre`, la franja pasa de
 * medianoche (18:00 → 02:00 atiende hasta las 2 a. m. del día siguiente). Sin horario (null) siempre se atiende: manda
 * solo el interruptor.
 *
 * `abiertoPorHorario` hace la misma cuenta que fn_abierto_por_horario en la base (una prueba las compara). La base es
 * quien decide si un pedido entra; esto es para explicarle a la gente por qué está cerrado y cuándo abre.
 */

export type Franja = { abre: string; cierra: string };
export type Horario = (Franja | null)[];

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** Lo que se propone al activar el horario por primera vez: todos los días de 11 a. m. a 10 p. m. */
export const HORARIO_INICIAL: Horario = Array.from({ length: 7 }, () => ({ abre: "11:00", cierra: "22:00" }));

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** "18:30" -> 1110 (minutos desde medianoche); null si no es una hora. */
export function minutosDelDia(hora: string | null | undefined): number | null {
  if (!hora || !HORA.test(hora)) return null;
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

export function horarioValido(h: unknown): h is Horario {
  if (!Array.isArray(h) || h.length !== 7) return false;
  return h.every((d) => {
    if (d === null) return true;
    if (typeof d !== "object") return false;
    const { abre, cierra } = d as Partial<Franja>;
    return minutosDelDia(abre) !== null && minutosDelDia(cierra) !== null && abre !== cierra;
  });
}

/** Lo que llega de la base, ya revisado: un horario válido o null (sin horario). */
export function leerHorario(crudo: unknown): Horario | null {
  return horarioValido(crudo) ? crudo : null;
}

/**
 * Día de la semana (0 = domingo) y minutos del día en Bogotá. Colombia no cambia la hora (UTC−5 todo el año), así que
 * se resta a mano: da lo mismo en el servidor y en cualquier celular, sin depender de la zona que tenga configurada.
 */
export function momentoBogota(fecha: Date): { dia: number; minutos: number } {
  const local = new Date(fecha.getTime() - 5 * 3_600_000);
  return { dia: local.getUTCDay(), minutos: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** ¿A esa hora se atiende? Sin horario, siempre. */
export function abiertoPorHorario(horario: Horario | null | undefined, fecha: Date): boolean {
  if (!horario) return true;
  const { dia, minutos } = momentoBogota(fecha);
  const hoy = horario[dia];
  const ayer = horario[(dia + 6) % 7];
  if (hoy) {
    const abre = minutosDelDia(hoy.abre)!;
    const cierra = minutosDelDia(hoy.cierra)!;
    if (abre < cierra && minutos >= abre && minutos < cierra) return true;
    if (abre > cierra && minutos >= abre) return true; // pasa de medianoche: la parte de hoy
  }
  if (ayer) {
    const abre = minutosDelDia(ayer.abre)!;
    const cierra = minutosDelDia(ayer.cierra)!;
    if (abre > cierra && minutos < cierra) return true; // la madrugada de la franja de ayer
  }
  return false;
}

/** "18:30" -> "6:30 p. m."; "00:00" -> "12:00 a. m.". */
export function textoHora(hora: string): string {
  const m = minutosDelDia(hora);
  if (m === null) return hora;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "11:00 a. m. – 10:00 p. m." o "Cerrado". */
export function textoFranja(f: Franja | null): string {
  return f ? `${textoHora(f.abre)} – ${textoHora(f.cierra)}` : "Cerrado";
}

/**
 * Cuándo vuelve a abrir, contando desde `fecha` (se asume que ahora está cerrado): la franja más próxima que todavía no
 * empieza, hoy o en los siete días siguientes. null si ningún día atiende.
 */
export function proximaApertura(horario: Horario, fecha: Date): { enDias: number; dia: number; hora: string } | null {
  const { dia, minutos } = momentoBogota(fecha);
  for (let salto = 0; salto <= 7; salto++) {
    const d = (dia + salto) % 7;
    const franja = horario[d];
    if (!franja) continue;
    const abre = minutosDelDia(franja.abre)!;
    if (salto === 0 && abre <= minutos) continue; // la de hoy ya pasó (o ya empezó y terminó)
    return { enDias: salto, dia: d, hora: franja.abre };
  }
  return null;
}

/** "Abre hoy a las 6:00 p. m.", "Abre mañana a las 11:00 a. m.", "Abre el lunes a las 11:00 a. m.". "" si no se sabe. */
export function textoProximaApertura(horario: Horario | null | undefined, fecha: Date): string {
  if (!horario) return "";
  const p = proximaApertura(horario, fecha);
  if (!p) return "";
  const cuando = p.enDias === 0 ? "hoy" : p.enDias === 1 ? "mañana" : `el ${DIAS_SEMANA[p.dia].toLowerCase()}`;
  return `Abre ${cuando} a las ${textoHora(p.hora)}`; // sin punto final: "a. m." ya termina en punto
}
