import { formatearPesos, type Pesos } from "@/lib/dinero";

export type Veredicto = { titulo: string; detalle: string; tono: "bien" | "alerta" | "neutro" };

/**
 * La pregunta del dueño es "¿voy ganando hoy?". Se responde en una frase, sin tecnicismos.
 * (Ganancia aproximada = ventas − gastos; en la mañana los gastos de compras suelen ir por delante.)
 */
export function veredictoDelDia(ventas: Pesos, gastos: Pesos): Veredicto {
  const ganancia = ventas - gastos;
  if (ventas === 0 && gastos === 0) return { titulo: "Día sin movimiento", detalle: "Toma el primer pedido para empezar.", tono: "neutro" };
  if (ganancia > 0) return { titulo: "Hoy vas ganando", detalle: `Ya cubriste los gastos y te sobran ${formatearPesos(ganancia)}.`, tono: "bien" };
  if (ganancia === 0) return { titulo: "Hoy vas parejo", detalle: "Las ventas igualan los gastos.", tono: "neutro" };
  return { titulo: "Aún no cubres los gastos", detalle: `Faltan ${formatearPesos(-ganancia)} en ventas para cubrirlos.`, tono: "alerta" };
}
