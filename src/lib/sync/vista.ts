/**
 * La vista que se le muestra a quien trabaja sin conexión: la última copia del servidor (Snapshot) con las
 * operaciones de la cola aplicadas encima, en orden. Es lógica pura (sin React ni red) y solo calcula lo que la
 * pantalla necesita para seguir trabajando; el servidor sigue siendo quien decide cuando las operaciones suben
 * (precios, número de pedido, saldos definitivos).
 */
import type { ClienteFiado, ItemPedidoResumen, PedidoCobrado, PedidoPendiente } from "@/lib/datos/tipos";
import { totalPedido } from "@/lib/dinero";
import { hoyDeTrabajo } from "@/lib/fechas";
import { normalizarTelefono } from "@/lib/telefono";
import type { ItemEnvio, Operacion, OperacionEnCola, Snapshot } from "./tipos";

/** Los pedidos que quedan en la lista de pendientes: lo cobrado y entregado ya no hay nada que hacerle. */
const sigueEnLista = (p: PedidoPendiente) => !(p.estado === "entregado" && p.cobrado);

/** Convierte lo que se pidió en las líneas de un pedido, leyendo precios y adiciones de la copia del menú. */
export function itemsDeEnvio(s: Snapshot, items: ItemEnvio[], prefijoId: string): ItemPedidoResumen[] {
  const filas: ItemPedidoResumen[] = [];
  items.forEach((it, i) => {
    const producto = s.menu.productos.find((p) => p.id === it.productoId);
    if (!producto) return; // el plato ya no existe en la copia: el servidor lo dirá al subir
    const adiciones = s.menu.modificadores
      .filter((m) => it.adiciones.includes(m.id))
      .map((m) => ({ id: m.id, nombre: m.nombre, precio: m.precio_extra }))
      .sort((a, b) => a.precio - b.precio || a.nombre.localeCompare(b.nombre));
    // Una categoría puede decir que sus platos no pasan por la cocina (bebidas); si la copia no lo trae, se asume que sí.
    const sePrepara = s.menu.categorias.find((c) => c.id === producto.categoria_id)?.se_prepara !== false;
    filas.push({ id: `${prefijoId}:${i}`, nombre: producto.nombre, cantidad: it.cantidad, notas: it.notas.trim() || null, adiciones, ...(sePrepara ? {} : { se_prepara: false }) });
  });
  return filas;
}

/** ¿Alguna de estas líneas hay que cocinarla? (igual que `para_cocina` en la base). */
const hayQueCocinar = (items: ItemPedidoResumen[]) => items.some((i) => i.se_prepara !== false);

/** Total de unas líneas con los precios de la copia del menú. */
export function totalDeItems(s: Snapshot, items: ItemEnvio[]): number {
  return totalPedido(
    items.flatMap((it) => {
      const producto = s.menu.productos.find((p) => p.id === it.productoId);
      if (!producto) return [];
      const adiciones = s.menu.modificadores.filter((m) => it.adiciones.includes(m.id)).map((m) => m.precio_extra);
      return [{ precio: producto.precio, cantidad: it.cantidad, adiciones }];
    })
  );
}

function ordenarClientes(clientes: ClienteFiado[]): ClienteFiado[] {
  return [...clientes].sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
}

function conMesaAbierta(s: Snapshot, mesaId: string, pedidoId: string | null): Snapshot["menu"] {
  return { ...s.menu, mesas: s.menu.mesas.map((m) => (m.id === mesaId ? { ...m, pedido_abierto: pedidoId } : m)) };
}

/** Aplica UNA operación sobre la copia. Si no encuentra lo que debe tocar (ya no existe), la deja igual. */
export function aplicarOperacion(s: Snapshot, op: Operacion): Snapshot {
  switch (op.tipo) {
    case "crear_pedido": {
      const d = op.datos;
      if (s.pendientes.some((p) => p.id === d.id)) return s; // ya está (la copia lo trae)
      const items = itemsDeEnvio(s, d.items, op.clave);
      if (items.length === 0) return s;
      const mesa = d.tipo === "mesa" ? (s.menu.mesas.find((m) => m.id === d.mesaId)?.nombre ?? null) : null;
      const nuevo: PedidoPendiente = {
        id: d.id,
        numero: -(op.numeroLocal ?? 1),
        tipo: d.tipo,
        estado: hayQueCocinar(items) ? "pendiente" : "listo", // solo bebidas: no hay nada que cocinar
        created_at: op.ocurridoEn,
        total: totalDeItems(s, d.items),
        cobrado: false,
        mesa,
        contacto_nombre: d.contactoNombre.trim() || null,
        contacto_telefono: normalizarTelefono(d.contactoTelefono) ?? (d.contactoTelefono.trim() || null),
        direccion: d.tipo === "domicilio" ? d.direccion.trim() || null : null,
        notas: d.notas.trim() || null,
        items,
      };
      return {
        ...s,
        pendientes: [...s.pendientes, nuevo],
        menu: d.tipo === "mesa" && d.mesaId ? conMesaAbierta(s, d.mesaId, d.id) : s.menu,
      };
    }

    case "agregar_items": {
      const d = op.datos;
      const previo = s.pendientes.find((p) => p.id === d.pedidoId);
      if (!previo || previo.cobrado) return s;
      const mas = itemsDeEnvio(s, d.items, op.clave);
      if (mas.length === 0) return s;
      const actualizado: PedidoPendiente = {
        ...previo,
        // Lo nuevo hay que prepararlo; si no se cocina (una bebida), el pedido no vuelve a la cocina: a lo sumo, si ya
        // estaba entregado, queda listo para entregar eso.
        estado: hayQueCocinar(mas) ? "pendiente" : previo.estado === "entregado" ? "listo" : previo.estado,
        total: previo.total + totalDeItems(s, d.items),
        items: [...previo.items, ...mas],
      };
      return { ...s, pendientes: s.pendientes.map((p) => (p.id === d.pedidoId ? actualizado : p)) };
    }

    case "cambiar_estado": {
      const d = op.datos;
      if (!s.pendientes.some((p) => p.id === d.pedidoId)) return s;
      return {
        ...s,
        pendientes: s.pendientes.map((p) => (p.id === d.pedidoId ? { ...p, estado: d.estado } : p)).filter(sigueEnLista),
      };
    }

    case "cobrar": {
      const d = op.datos;
      const previo = s.pendientes.find((p) => p.id === d.pedidoId);
      if (!previo || previo.cobrado) return s;
      const cobrado: PedidoCobrado = {
        id: previo.id,
        numero: previo.numero,
        tipo: previo.tipo,
        mesa: previo.mesa,
        contacto_nombre: previo.contacto_nombre,
        total: previo.total,
        propina: d.propina,
        cobrado_at: op.ocurridoEn,
        medios: [...new Set(d.pagos.map((p) => p.medio))],
      };
      const hoy = hoyDeTrabajo(new Date(op.ocurridoEn), s.contexto.restaurante?.hora_corte);
      let clientes = s.clientes;
      for (const pago of d.pagos) {
        if (pago.medio !== "fiado" || !pago.clienteId) continue;
        clientes = clientes.map((c) =>
          c.id === pago.clienteId ? { ...c, saldo: c.saldo + pago.monto, debe_desde: c.debe_desde ?? hoy } : c
        );
      }
      const menu = previo.tipo === "mesa" ? { ...s.menu, mesas: s.menu.mesas.map((m) => (m.pedido_abierto === previo.id ? { ...m, pedido_abierto: null } : m)) } : s.menu;
      return {
        ...s,
        menu,
        pendientes: s.pendientes.map((p) => (p.id === previo.id ? { ...p, cobrado: true } : p)).filter(sigueEnLista),
        cobrados: [cobrado, ...s.cobrados],
        clientes: ordenarClientes(clientes),
      };
    }

    case "crear_cliente": {
      const d = op.datos;
      if (s.clientes.some((c) => c.id === d.id)) return s;
      const nuevo: ClienteFiado = {
        id: d.id,
        nombre: d.nombre.trim(),
        telefono: normalizarTelefono(d.telefono) ?? (d.telefono.trim() || null),
        saldo: 0,
        debe_desde: null,
      };
      return { ...s, clientes: ordenarClientes([...s.clientes, nuevo]) };
    }

    case "abonar": {
      const d = op.datos;
      if (!s.clientes.some((c) => c.id === d.clienteId)) return s;
      const clientes = s.clientes.map((c) => {
        if (c.id !== d.clienteId) return c;
        const saldo = Math.max(0, c.saldo - d.monto);
        return { ...c, saldo, debe_desde: saldo === 0 ? null : c.debe_desde };
      });
      return { ...s, clientes: ordenarClientes(clientes) };
    }

    case "gasto":
      return s; // un gasto no cambia nada de lo que se ve sin conexión
  }
}

/** Copia del servidor + operaciones que aún cuentan (las rechazadas no se aplican: no tuvieron efecto). */
export function vistaDe(s: Snapshot, ops: OperacionEnCola[]): Snapshot {
  return ops.filter((o) => o.estado !== "fallida").reduce<Snapshot>((acc, o) => aplicarOperacion(acc, o), s);
}

/**
 * La lista de pendientes que mandó el servidor, con lo que está en la cola encima: los cambios de estado y los cobros
 * que todavía no suben. Es para la app normal cuando la señal se cae sin salir de la pantalla: lo que la persona acaba
 * de tocar se sigue viendo hecho, en vez de devolverse a como estaba. (Los pedidos nuevos y los platos agregados no
 * se pintan aquí: necesitan el menú, que solo tiene la copia completa de `vistaDe`.)
 * Aplicarla sobre una lista que ya trae esos cambios da lo mismo. Sin nada que aplicar devuelve la misma lista.
 */
export function pendientesConCola(pendientes: PedidoPendiente[], ops: OperacionEnCola[]): PedidoPendiente[] {
  let lista = pendientes;
  for (const op of ops) {
    if (op.estado === "fallida") continue;
    if (op.tipo === "cambiar_estado") {
      const d = op.datos;
      if (lista.some((p) => p.id === d.pedidoId && p.estado !== d.estado)) lista = lista.map((p) => (p.id === d.pedidoId ? { ...p, estado: d.estado } : p));
    } else if (op.tipo === "cobrar") {
      const d = op.datos;
      if (lista.some((p) => p.id === d.pedidoId && !p.cobrado)) lista = lista.map((p) => (p.id === d.pedidoId ? { ...p, cobrado: true } : p));
    }
  }
  if (lista === pendientes) return pendientes;
  return lista.filter(sigueEnLista);
}
