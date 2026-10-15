/**
 * Ritmo de las consultas periódicas del personal ("tiempo real" = preguntar cada tanto, sin websockets): rápido
 * cuando algo acaba de cambiar o alguien está usando la pantalla, y cada vez más espaciado mientras todo sigue igual,
 * hasta un tope. Lógica pura (sin React ni red): la usa `lib/pulso.ts`.
 */
export type Ritmo = { minMs: number; maxMs: number };

/** La plancha: un pedido nuevo no puede tardar más de 8 s en aparecer. */
export const RITMO_PLANCHA: Ritmo = { minMs: 4_000, maxMs: 8_000 };
/** Pendientes: lo que cambia lo hace otra persona (la plancha, la caja, un cliente). */
export const RITMO_PENDIENTES: Ritmo = { minMs: 8_000, maxMs: 20_000 };
/** El aviso de pedidos en línea, mientras pueda llegar uno. */
export const RITMO_AVISO: Ritmo = { minMs: 5_000, maxMs: 20_000 };
/** El aviso cuando no puede llegar ninguno (pedidos en línea apagados o fuera del horario) y no hay ninguno esperando. */
export const RITMO_AVISO_EN_CALMA: Ritmo = { minMs: 60_000, maxMs: 60_000 };

/** Cuánto esperar antes de la próxima consulta: `minMs`, y ×1,5 por cada vuelta sin cambios, hasta `maxMs`. */
export function esperaSiguiente(r: Ritmo, vueltasSinCambio: number): number {
  const n = Math.max(0, Math.floor(vueltasSinCambio));
  return Math.min(r.maxMs, Math.round(r.minMs * 1.5 ** n));
}

/**
 * Cuando varias partes de la pantalla comparten la consulta (la plancha y el aviso, p. ej.) manda la más exigente: el
 * menor de los mínimos y el menor de los topes. null si ninguna la pide (las que solo escuchan no cuentan).
 */
export function ritmoCombinado(ritmos: readonly (Ritmo | null)[]): Ritmo | null {
  const pedidos = ritmos.filter((r): r is Ritmo => r !== null);
  if (pedidos.length === 0) return null;
  const minMs = Math.min(...pedidos.map((r) => r.minMs));
  const maxMs = Math.min(...pedidos.map((r) => r.maxMs));
  return { minMs, maxMs: Math.max(minMs, maxMs) };
}
