/** Frases en español para mostrar qué es cada operación de la cola (pantalla "Sincronización"). */
import { formatearPesos } from "@/lib/dinero";
import { ETIQUETA_CATEGORIA } from "@/lib/gastos";
import { numeroVisible } from "./numero";
import type { OperacionEnCola, Snapshot } from "./tipos";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una línea que una persona entiende: "Pedido N1 · Mesa 2 · 3 platos", "Cobro de $ 23.000"… */
export function describirOperacion(op: OperacionEnCola, vista: Snapshot | null): string {
  const pedido = (id: string) => vista?.pendientes.find((p) => p.id === id) ?? null;
  const cliente = (id: string) => vista?.clientes.find((c) => c.id === id)?.nombre ?? "un cliente";
  const platos = (items: { cantidad: number }[]) => plural(items.reduce((s, i) => s + i.cantidad, 0), "plato", "platos");

  switch (op.tipo) {
    case "crear_pedido": {
      const d = op.datos;
      const donde = d.tipo === "mesa" ? (vista?.menu.mesas.find((m) => m.id === d.mesaId)?.nombre ?? "Mesa") : d.tipo === "llevar" ? "Para llevar" : "Domicilio";
      return `Pedido ${numeroVisible(-(op.numeroLocal ?? 1))} · ${donde} · ${platos(d.items)}`;
    }
    case "agregar_items": {
      const p = pedido(op.datos.pedidoId);
      return `Agregar ${platos(op.datos.items)} al pedido ${p ? numeroVisible(p.numero) : ""}`.trim();
    }
    case "cambiar_estado": {
      const p = pedido(op.datos.pedidoId);
      const estado = op.datos.estado === "listo" ? "listo" : op.datos.estado === "entregado" ? "entregado" : "pendiente";
      return `Pedido ${p ? numeroVisible(p.numero) : ""} marcado ${estado}`.replace("  ", " ");
    }
    case "cobrar": {
      const d = op.datos;
      const total = d.pagos.reduce((s, p) => s + p.monto, 0);
      return `Cobro de ${formatearPesos(total)}${d.pagos.some((p) => p.medio === "fiado") ? " (con fiado)" : ""}`;
    }
    case "crear_cliente":
      return `Cliente nuevo: ${op.datos.nombre}`;
    case "abonar":
      return `Abono de ${formatearPesos(op.datos.monto)} de ${cliente(op.datos.clienteId)}`;
    case "gasto":
      return `Gasto de ${formatearPesos(op.datos.monto)} · ${ETIQUETA_CATEGORIA[op.datos.categoria] ?? op.datos.categoria}`;
  }
}
