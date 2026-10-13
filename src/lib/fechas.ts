/** Fechas y horas en hora de Colombia (America/Bogota), igual que la base de datos. */

const ZONA = "America/Bogota";

/** 'YYYY-MM-DD' de hoy en Bogotá. */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
}

/** Hora (de Bogotá) en que termina el día de trabajo si el restaurante no dice otra (restaurantes.hora_corte). */
export const HORA_CORTE = 4;

/**
 * 'YYYY-MM-DD' del DÍA DE TRABAJO: el día no cambia a medianoche sino a la hora de corte (4 a. m.), para que la venta
 * de la 1:44 a. m. siga siendo del día que empezó la tarde anterior. Es la misma cuenta que hace la base
 * (fn_fecha_trabajo); lo que no sabe el celular es si el dueño ya cerró el día a mano: eso lo decide el servidor.
 */
export function hoyDeTrabajo(ahora: Date = new Date(), horaCorte: number = HORA_CORTE): string {
  return hoyBogota(new Date(ahora.getTime() - horaCorte * 3_600_000));
}

/** 4 -> "4:00 a. m."; 0 -> "12:00 a. m." (medianoche); 12 -> "12:00 p. m.". Para decir a qué hora cambia el día. */
export function textoHoraCorte(horaCorte: number = HORA_CORTE): string {
  const h = Math.min(Math.max(Math.trunc(horaCorte), 0), 23);
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "a. m." : "p. m."}`;
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

/** '2026-10-13' + (-1) -> '2026-10-12'. Cruza meses y años. */
export function sumarDias(fecha: string, dias: number): string {
  const f = fechaUtc(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
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
