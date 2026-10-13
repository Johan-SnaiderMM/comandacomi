/**
 * Seguimiento del pedido para el cliente: lógica pura (sin React ni red). Convierte lo que devuelve publico_ver_pedido
 * en lo que se muestra: los pasos con su hora, el tiempo que falta y cuántos platos ya están listos.
 */
import type { EtapaPedido, SeguimientoPublico } from "@/lib/publico/tipos";

export type PasoSeguimiento = {
  clave: "enviado" | "aceptado" | "preparando" | "listo" | "entregado";
  etiqueta: string;
  /** Ya ocurrió. */
  hecho: boolean;
  /** Es el paso en que está el pedido ahora. */
  actual: boolean;
  /** ISO de cuándo ocurrió (null si todavía no). */
  hora: string | null;
};

/** Motivo con el que la base anula un pedido que el propio cliente canceló (publico_cancelar_pedido). */
export const MOTIVO_CANCELADO_POR_CLIENTE = "Cancelado por el cliente";

const ORDEN: Record<Exclude<EtapaPedido, "cancelado">, number> = { por_confirmar: 0, preparando: 1, listo: 2, entregado: 3 };

/** Los pasos que ve el cliente, en orden. El "listo" cambia de texto según sea para recoger o a domicilio. */
export function pasosDeSeguimiento(s: SeguimientoPublico): PasoSeguimiento[] {
  const p = s.pedido;
  if (p.etapa === "cancelado") {
    return [
      { clave: "enviado", etiqueta: "Pedido enviado", hecho: true, actual: false, hora: p.created_at },
    ];
  }
  const nivel = ORDEN[p.etapa];
  const domicilio = p.tipo === "domicilio";
  return [
    { clave: "enviado", etiqueta: "Pedido enviado", hecho: true, actual: nivel === 0, hora: p.created_at },
    { clave: "aceptado", etiqueta: "El restaurante lo aceptó", hecho: nivel >= 1, actual: false, hora: p.confirmado_at },
    { clave: "preparando", etiqueta: "Lo están preparando", hecho: nivel >= 2, actual: nivel === 1, hora: null },
    {
      clave: "listo",
      etiqueta: domicilio ? "Listo: sale hacia tu dirección" : "Listo para recoger",
      hecho: nivel >= 2,
      actual: nivel === 2,
      hora: p.listo_at,
    },
    { clave: "entregado", etiqueta: "Entregado", hecho: nivel >= 3, actual: nivel === 3, hora: p.entregado_at },
  ];
}

/**
 * Minutos que faltan según el tiempo estimado que dio el restaurante al aceptar (contados desde que aceptó).
 * null si no hay estimación o el pedido ya no está en preparación; 0 si ya pasó el tiempo.
 */
export function minutosRestantes(s: SeguimientoPublico): number | null {
  const { etapa, confirmado_at, tiempo_estimado_min } = s.pedido;
  if (etapa !== "preparando" || !confirmado_at || tiempo_estimado_min === null) return null;
  const fin = Date.parse(confirmado_at) + tiempo_estimado_min * 60_000;
  const resta = Math.ceil((fin - Date.parse(s.ahora)) / 60_000);
  return Math.max(0, resta);
}

/** "2 de 3 platos listos" → { listos: 2, total: 3 } (cuenta unidades, no líneas: 2 hamburguesas = 2 platos). */
export function progresoDePlatos(items: { cantidad: number; listo: boolean }[]): { listos: number; total: number; lineasListas: number; lineas: number } {
  const total = items.reduce((s, i) => s + i.cantidad, 0);
  const listos = items.filter((i) => i.listo).reduce((s, i) => s + i.cantidad, 0);
  return { listos, total, lineasListas: items.filter((i) => i.listo).length, lineas: items.length };
}

/** ¿El seguimiento ya terminó (no hace falta seguir consultando)? */
export function seguimientoTerminado(etapa: EtapaPedido): boolean {
  return etapa === "entregado" || etapa === "cancelado";
}

/** Cada cuánto se consulta (ms): rápido al principio, más espaciado si lleva rato igual. */
export function intervaloDeConsulta(segundosDesdeCambio: number): number {
  if (segundosDesdeCambio < 120) return 4_000;
  if (segundosDesdeCambio < 600) return 8_000;
  return 15_000;
}
