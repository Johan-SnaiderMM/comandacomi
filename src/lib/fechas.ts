/** Fechas y horas en hora de Colombia (America/Bogota), igual que la base de datos. */

const ZONA = "America/Bogota";

/** 'YYYY-MM-DD' de hoy en Bogotá. */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
}

// Nombres escritos a mano: Intl cambia de forma según el motor (servidor vs. navegador) y rompería la hidratación.
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fechaUtc(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** '2026-10-05' -> "Lunes 5 de octubre". */
export function fechaLarga(fecha: string): string {
  const f = fechaUtc(fecha);
  return mayuscula(`${DIAS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`);
}

/** '2026-10-05' -> "lun 5 oct". */
export function fechaCorta(fecha: string): string {
  const f = fechaUtc(fecha);
  return `${DIAS[f.getUTCDay()].slice(0, 3)} ${f.getUTCDate()} ${MESES[f.getUTCMonth()].slice(0, 3)}`;
}

/** '2026-10-05' -> "Hoy", "Ayer" o "lun 5 oct". */
export function fechaRelativa(fecha: string, hoy: string = hoyBogota()): string {
  const dias = diasEntre(fecha, hoy);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return fechaCorta(fecha);
}

/** Días completos entre dos fechas 'YYYY-MM-DD' (hasta - desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaUtc(hasta).getTime() - fechaUtc(desde).getTime()) / 86_400_000);
}

/** ISO -> "2:35 p. m." en hora de Bogotá. */
export function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONA })
    .format(new Date(iso))
    .replace(/\s/g, " ");
}

/** Minutos enteros transcurridos desde un instante (nunca negativo). */
export function minutosDesde(iso: string, ahora: number = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
}

/** 4 -> "4 min"; 65 -> "1 h 05 min". */
export function textoEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** "hace 3 días", "hoy", "ayer" a partir de días enteros. */
export function textoDias(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
