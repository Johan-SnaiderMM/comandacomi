import type { Inicio } from "@/lib/datos/tipos";
import { formatearPesos, type Pesos } from "@/lib/dinero";
import { sumarDias } from "@/lib/fechas";

/** Lo que Inicio pone en el tiquete de arriba. */
export type ResumenDeInicio = {
  /** true = es el día que el dueño acaba de cerrar (no la jornada nueva, que todavía está vacía). */
  cerrado: boolean;
  fecha: string;
  ventas: Pesos;
  gastos: Pesos;
  ganancia: Pesos;
  /** Cuántos pedidos se cobraron; null cuando se muestra el día cerrado (la base no lo trae para ese día). */
  pedidos: number | null;
};

type Cifra = "ventas_hoy" | "gastos_hoy" | "ganancia_hoy" | "ventas_ayer" | "gastos_ayer" | "ganancia_ayer";

/** Lo que Inicio necesita para el tiquete del día, ya sin nulls. */
export type CifrasDeInicio = Pick<Inicio, "fecha" | "jornada_adelantada" | "pedidos_hoy"> & Record<Cifra, Pesos>;

/**
 * Las cifras de plata del día, o null si quien entra no ve las cuentas (la base se las manda en null: ver migración
 * 19). Inicio solo arma el tiquete con lo que devuelve esto.
 */
export function cifrasDelDia(i: Inicio): CifrasDeInicio | null {
  const { ventas_hoy, gastos_hoy, ganancia_hoy, ventas_ayer, gastos_ayer, ganancia_ayer } = i;
  if (ventas_hoy === null || gastos_hoy === null || ganancia_hoy === null || ventas_ayer === null || gastos_ayer === null || ganancia_ayer === null) {
    return null;
  }
  return { fecha: i.fecha, jornada_adelantada: i.jornada_adelantada, pedidos_hoy: i.pedidos_hoy, ventas_hoy, gastos_hoy, ganancia_hoy, ventas_ayer, gastos_ayer, ganancia_ayer };
}

/**
 * Qué día muestra Inicio. Normalmente la jornada en curso. Pero cuando el dueño cierra el día antes de la hora de
 * corte (se va a la 1 a. m. porque no hay movimiento), la jornada nueva arranca vacía: mostrarle ceros sería esconderle
 * justo lo que quiere ver al cerrar. Mientras no se registre nada nuevo, Inicio muestra el día recién cerrado.
 */
export function resumenDeInicio(i: CifrasDeInicio): ResumenDeInicio {
  const recienCerrado = i.jornada_adelantada === true && i.ventas_hoy === 0 && i.gastos_hoy === 0;
  if (recienCerrado) {
    return { cerrado: true, fecha: sumarDias(i.fecha, -1), ventas: i.ventas_ayer, gastos: i.gastos_ayer, ganancia: i.ganancia_ayer, pedidos: null };
  }
  return { cerrado: false, fecha: i.fecha, ventas: i.ventas_hoy, gastos: i.gastos_hoy, ganancia: i.ganancia_hoy, pedidos: i.pedidos_hoy };
}

export type Veredicto = { titulo: string; detalle: string; tono: "bien" | "alerta" | "neutro" };

/**
 * «¿Voy ganando hoy?» en una frase (ganancia aproximada = ventas − gastos). Con `diaCerrado` (ya cerró y no llega la
 * hora de corte), sin nada nuevo no es un día sin movimiento: es un día que terminó.
 */
export function veredictoDelDia(ventas: Pesos, gastos: Pesos, diaCerrado = false): Veredicto {
  const ganancia = ventas - gastos;
  if (ventas === 0 && gastos === 0) {
    return diaCerrado
      ? { titulo: "Día cerrado", detalle: "Lo que registres desde ahora cuenta para el día siguiente.", tono: "neutro" }
      : { titulo: "Día sin movimiento", detalle: "Toma el primer pedido para empezar.", tono: "neutro" };
  }
  if (ganancia > 0) return { titulo: "Hoy vas ganando", detalle: `Ya cubriste los gastos y te sobran ${formatearPesos(ganancia)}.`, tono: "bien" };
  if (ganancia === 0) return { titulo: "Hoy vas parejo", detalle: "Las ventas igualan los gastos.", tono: "neutro" };
  return { titulo: "Aún no cubres los gastos", detalle: `Faltan ${formatearPesos(-ganancia)} en ventas para cubrirlos.`, tono: "alerta" };
}
