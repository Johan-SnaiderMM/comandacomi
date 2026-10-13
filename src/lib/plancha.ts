/**
 * Lógica pura de la plancha y del aviso de pedidos nuevos (sin React ni red): cómo se llama cada pedido, cuánto
 * lleva esperando y qué hay de nuevo desde la última consulta.
 */
import type { PedidoPlancha, ResumenPorConfirmar } from "@/lib/datos/tipos";

/** "Mesa 3", "Domicilio · Yeison", "Recoge · Marta", "Para llevar". */
export function destinoDePedido(p: Pick<PedidoPlancha, "tipo" | "mesa" | "contacto_nombre" | "origen">): string {
  if (p.tipo === "mesa") return p.mesa ?? "Mesa";
  const nombre = p.contacto_nombre?.trim();
  if (p.tipo === "domicilio") return nombre ? `Domicilio · ${nombre}` : "Domicilio";
  // "llevar": si lo hizo el cliente en línea, él pasa a recogerlo
  if (p.origen === "cliente") return nombre ? `Recoge · ${nombre}` : "Recoge en el local";
  return nombre ? `Para llevar · ${nombre}` : "Para llevar";
}

/** Minutos enteros que lleva esperando, contra la hora del servidor (no la del celular). */
export function minutosDeEspera(desde: string, ahora: string): number {
  const ms = Date.parse(ahora) - Date.parse(desde);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : 0;
}

export type Urgencia = "normal" | "atencion" | "urgente";

/** Verde/neutro hasta 8 min, amarillo hasta 15, rojo después. Si el restaurante dio un tiempo, el rojo empieza al pasarlo. */
export function urgenciaDeEspera(minutos: number, tiempoEstimado: number | null = null): Urgencia {
  const limiteUrgente = tiempoEstimado !== null ? Math.max(tiempoEstimado, 5) : 15;
  const limiteAtencion = tiempoEstimado !== null ? Math.max(Math.round(limiteUrgente * 0.6), 3) : 8;
  if (minutos >= limiteUrgente) return "urgente";
  if (minutos >= limiteAtencion) return "atencion";
  return "normal";
}

/** Reloj corto: 0 → "Recién", 7 → "7 min", 65 → "1 h 5 min". */
export function textoDeEspera(minutos: number): string {
  if (minutos < 1) return "Recién";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function progresoDePedido(p: Pick<PedidoPlancha, "items">): { listos: number; total: number; completo: boolean } {
  const total = p.items.length;
  const listos = p.items.filter((i) => i.listo).length;
  return { listos, total, completo: total > 0 && listos === total };
}

/** Por preparar (el más viejo primero) y los que se acaban de marcar listos (el más reciente primero). */
export function separarPlancha(pedidos: PedidoPlancha[]): { porPreparar: PedidoPlancha[]; listos: PedidoPlancha[] } {
  const porPreparar = pedidos.filter((p) => p.estado !== "listo").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.numero - b.numero);
  const listos = pedidos.filter((p) => p.estado === "listo").sort((a, b) => Date.parse(b.listo_at ?? b.created_at) - Date.parse(a.listo_at ?? a.created_at));
  return { porPreparar, listos };
}

/**
 * Trabajo NUEVO para la cocina desde la última consulta: por cada pedido, los platos por preparar que antes no estaban.
 * Sirve para dos casos con una sola regla: el pedido que acaba de llegar (todos sus platos son nuevos) y el pedido que
 * ya estaba y al que le agregaron platos ("la mesa pidió más"). Se mira plato por plato, no pedido por pedido: mirando
 * solo el pedido, los platos agregados llegaban sin sonar.
 * Un plato que ya se había visto y vuelve a quedar por preparar (alguien lo desmarcó) no cuenta como nuevo.
 */
export function platosNuevos(vistos: ReadonlySet<string>, pedidos: Pick<PedidoPlancha, "id" | "items">[]): { pedidoId: string; items: string[] }[] {
  return pedidos.flatMap((p) => {
    const items = p.items.filter((i) => !i.listo && !vistos.has(i.id)).map((i) => i.id);
    return items.length > 0 ? [{ pedidoId: p.id, items }] : [];
  });
}

/** Ids que aparecen ahora y antes no estaban (para el aviso de pedido nuevo). */
export function idsNuevos(vistos: ReadonlySet<string>, actuales: { id: string }[]): string[] {
  return actuales.filter((a) => !vistos.has(a.id)).map((a) => a.id);
}

/**
 * Texto del aviso al dueño: "Pedido #137 · Domicilio · $ 34.500" o "3 pedidos de clientes por confirmar". El espacio
 * entre "$" y la cifra es "duro" (no se parte en dos renglones en pantallas angostas).
 */
export function textoDeAviso(resumen: ResumenPorConfirmar, formatearPesos: (n: number) => string): string {
  if (resumen.cantidad <= 0) return "";
  if (resumen.cantidad === 1 && resumen.recientes[0]) {
    const r = resumen.recientes[0];
    const donde = r.tipo === "domicilio" ? "Domicilio" : "Recoger en el local";
    return `Pedido #${r.numero} · ${donde} · ${formatearPesos(r.total).replace(" ", " ")}`;
  }
  return `${resumen.cantidad} pedidos de clientes por confirmar`;
}
