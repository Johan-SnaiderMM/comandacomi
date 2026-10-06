/** Reglas de dinero y de negocio de las funciones SQL, sobre Postgres real (PGlite). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { CATEGORIAS_GASTO } from "@/lib/gastos";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Menu = {
  categorias: { id: string; nombre: string }[];
  productos: { id: string; categoria_id: string; nombre: string; precio: number; disponible: boolean }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  mesas: { id: string; nombre: string; pedido_abierto: string | null }[];
};

let db: PGlite;
let U: string;
let menu: Menu;

const plato = (nombre: string) => menu.productos.find((p) => p.nombre === nombre)!;
const mesaLibre = () => menu.mesas.find((m) => !m.pedido_abierto)!;
const inicio = () => rpc<Record<string, number>>(db, U, "obtener_inicio");
const clientes = () => rpc<{ id: string; nombre: string; saldo: number }[]>(db, U, "listar_clientes");

async function pedidoNuevo(items: { producto_id: string; cantidad?: number; adiciones?: string[]; notas?: string }[], tipo = "llevar", mesa: string | null = null) {
  return rpc<{ id: string; numero: number; total: number }>(db, U, "crear_pedido", { p_tipo: tipo, p_mesa_id: mesa, p_items: items });
}

beforeAll(async () => {
  db = await crearBase();
  ({ userId: U } = await crearRestauranteDemo(db, "Reglas"));
  menu = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("crear pedido: los precios salen de la base, no del cliente", () => {
  it("calcula el total con precio de la base + adiciones, y numera consecutivo", async () => {
    const burger = plato("Hamburguesa doble carne"); // 19.000
    const queso = menu.modificadores.find((m) => m.nombre === "Queso extra" && m.categoria_id === burger.categoria_id)!; // +2.000
    const a = await pedidoNuevo([{ producto_id: burger.id, cantidad: 2, adiciones: [queso.id], notas: "sin cebolla" }, { producto_id: plato("Gaseosa personal").id }]);
    expect(a.total).toBe((19000 + 2000) * 2 + 3500);
    const b = await pedidoNuevo([{ producto_id: plato("Perro caliente").id }]);
    expect(b.numero).toBe(a.numero + 1);

    const detalle = await rpc<{ items: { nombre: string; cantidad: number; subtotal: number; notas: string | null; adiciones: { nombre: string }[] }[] }>(db, U, "obtener_pedido", { p_pedido_id: a.id });
    const linea = detalle.items.find((i) => i.nombre === "Hamburguesa doble carne")!;
    expect(linea).toMatchObject({ cantidad: 2, subtotal: 42000, notas: "sin cebolla" });
    expect(linea.adiciones.map((x) => x.nombre)).toEqual(["Queso extra"]);
  });

  it("un precio enviado por el cliente se ignora", async () => {
    const r = await pedidoNuevo([{ producto_id: plato("Perro caliente").id, precio_unitario: 1, subtotal: 1 } as never]);
    expect(r.total).toBe(9000);
  });

  it("valida mesa, dirección, teléfono, cantidades y platos agotados", async () => {
    const p = plato("Perro caliente").id;
    await expect(rpc(db, U, "crear_pedido", { p_tipo: "mesa", p_mesa_id: null, p_items: [{ producto_id: p }] })).rejects.toThrow(/Elige una mesa/);
    await expect(rpc(db, U, "crear_pedido", { p_tipo: "domicilio", p_mesa_id: null, p_items: [{ producto_id: p }] })).rejects.toThrow(/dirección/);
    await expect(
      rpc(db, U, "crear_pedido", { p_tipo: "domicilio", p_mesa_id: null, p_items: [{ producto_id: p }], p_direccion: "Cra 1 #2-3", p_contacto_telefono: "123" })
    ).rejects.toThrow(/teléfono no es válido/);
    await expect(pedidoNuevo([])).rejects.toThrow(/al menos un plato/);
    await expect(pedidoNuevo([{ producto_id: p, cantidad: 0 }])).rejects.toThrow(/cantidad/);
    await expect(pedidoNuevo([{ producto_id: p, cantidad: 100 }])).rejects.toThrow(/cantidad/);

    await rpc(db, U, "cambiar_disponibilidad", { p_producto_id: p, p_disponible: false });
    await expect(pedidoNuevo([{ producto_id: p }])).rejects.toThrow(/no está disponible hoy/);
    await rpc(db, U, "cambiar_disponibilidad", { p_producto_id: p, p_disponible: true });
  });

  it("normaliza el teléfono del domicilio a +57...", async () => {
    const r = await rpc<{ id: string }>(db, U, "crear_pedido", {
      p_tipo: "domicilio", p_mesa_id: null, p_items: [{ producto_id: plato("Perro caliente").id }],
      p_direccion: "Cra 1 #2-3", p_contacto_nombre: "Pedro", p_contacto_telefono: "300 123 4567",
    });
    const d = await rpc<{ pedido: { contacto_telefono: string } }>(db, U, "obtener_pedido", { p_pedido_id: r.id });
    expect(d.pedido.contacto_telefono).toBe("+573001234567");
  });
});

describe("estado, agregar platos y pendientes", () => {
  it("pendiente → listo → entregado; agregar platos lo devuelve a pendiente", async () => {
    const mesa = mesaLibre();
    const p = await pedidoNuevo([{ producto_id: plato("Salchipapa sencilla").id }], "mesa", mesa.id);
    const enLista = async () => (await rpc<{ id: string; estado: string }[]>(db, U, "listar_pedidos_pendientes")).find((x) => x.id === p.id);
    expect((await enLista())?.estado).toBe("pendiente");

    await rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "listo" });
    expect((await enLista())?.estado).toBe("listo");
    await rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" });
    expect((await enLista())?.estado).toBe("entregado"); // sigue en la lista porque falta cobrar

    const mas = await rpc<{ total: number }>(db, U, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [{ producto_id: plato("Gaseosa personal").id }] });
    expect(mas.total).toBe(12000 + 3500);
    expect((await enLista())?.estado).toBe("pendiente");
    await expect(rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "volando" })).rejects.toThrow(/estado no es válido/);
  });

  it("la mesa con pedido abierto aparece ocupada", async () => {
    const m = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
    expect(m.mesas.filter((x) => x.pedido_abierto).length).toBeGreaterThan(0);
  });
});

describe("cobrar", () => {
  it("efectivo: calcula el vuelto y el pedido sale de la lista cuando ya se entregó", async () => {
    const p = await pedidoNuevo([{ producto_id: plato("Perro caliente").id, cantidad: 2 }]); // 18.000
    await rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" });
    const r = await rpc<{ vuelto: number; cobrado: number }>(db, U, "cobrar_pedido", {
      p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 18000, recibido: 20000 }],
    });
    expect(r).toMatchObject({ vuelto: 2000, cobrado: 18000 });
    const lista = await rpc<{ id: string }[]>(db, U, "listar_pedidos_pendientes");
    expect(lista.some((x) => x.id === p.id)).toBe(false);
    await expect(
      rpc(db, U, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 18000, recibido: 18000 }] })
    ).rejects.toThrow(/ya está cobrado/);
  });

  it("rechaza efectivo recibido menor, pagos que no suman y propina inválida", async () => {
    const p = await pedidoNuevo([{ producto_id: plato("Perro caliente").id }]); // 9.000
    const cobrar = (propina: number, pagos: object[]) => rpc(db, U, "cobrar_pedido", { p_pedido_id: p.id, p_propina: propina, p_pagos: pagos });
    await expect(cobrar(0, [{ medio: "efectivo", monto: 9000, recibido: 5000 }])).rejects.toThrow(/menor/);
    await expect(cobrar(0, [{ medio: "efectivo", monto: 8000, recibido: 8000 }])).rejects.toThrow(/Los pagos suman/);
    await expect(cobrar(0, [{ medio: "efectivo", monto: 10000, recibido: 10000 }])).rejects.toThrow(/Los pagos suman/);
    await expect(cobrar(-1, [{ medio: "efectivo", monto: 9000, recibido: 9000 }])).rejects.toThrow(/propina/);
    await expect(cobrar(0, [])).rejects.toThrow(/Elige cómo se paga/);
    await expect(cobrar(0, [{ medio: "bitcoin", monto: 9000 }])).rejects.toThrow(/medio de pago/);
    // nada quedó a medias
    const d = await rpc<{ pedido: { cobrado: boolean }; pagos: unknown[] }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    expect(d.pedido.cobrado).toBe(false);
    expect(d.pagos).toHaveLength(0);
  });

  it("Nequi/transferencia con propina y referencia opcional", async () => {
    const p = await pedidoNuevo([{ producto_id: plato("Carne a la plancha").id }]); // 24.000
    const r = await rpc<{ cobrado: number; propina: number }>(db, U, "cobrar_pedido", {
      p_pedido_id: p.id, p_propina: 2500, p_pagos: [{ medio: "transferencia", monto: 26500, referencia: "NEQ123456" }],
    });
    expect(r).toMatchObject({ cobrado: 26500, propina: 2500 });
    const d = await rpc<{ pagos: { medio: string; referencia: string }[] }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    expect(d.pagos[0]).toMatchObject({ medio: "transferencia", referencia: "NEQ123456" });
  });

  it("fiado: carga la deuda al cliente; pago mixto efectivo + fiado", async () => {
    const [cliente] = await clientes();
    const antes = cliente.saldo;
    const p = await pedidoNuevo([{ producto_id: plato("Churrasco").id }]); // 32.000
    await rpc(db, U, "cobrar_pedido", {
      p_pedido_id: p.id, p_propina: 0,
      p_pagos: [{ medio: "efectivo", monto: 12000, recibido: 20000 }, { medio: "fiado", monto: 20000, cliente_id: cliente.id }],
    });
    const despues = (await clientes()).find((c) => c.id === cliente.id)!.saldo;
    expect(despues).toBe(antes + 20000);
    await expect(
      rpc(db, U, "cobrar_pedido", { p_pedido_id: (await pedidoNuevo([{ producto_id: plato("Perro caliente").id }])).id, p_propina: 0, p_pagos: [{ medio: "fiado", monto: 9000 }] })
    ).rejects.toThrow(/a quién se le fía/);
  });
});

describe("anular con motivo (nada se borra)", () => {
  it("anular un cobro revierte pagos y fiado y deja el pedido por cobrar", async () => {
    const [cliente] = await clientes();
    const antes = cliente.saldo;
    const p = await pedidoNuevo([{ producto_id: plato("Churrasco").id }]);
    await rpc(db, U, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "fiado", monto: 32000, cliente_id: cliente.id }] });
    expect((await clientes()).find((c) => c.id === cliente.id)!.saldo).toBe(antes + 32000);

    await expect(rpc(db, U, "anular_cobro", { p_pedido_id: p.id, p_motivo: "   " })).rejects.toThrow(/motivo/);
    await rpc(db, U, "anular_cobro", { p_pedido_id: p.id, p_motivo: "Se equivocaron de cliente" });
    expect((await clientes()).find((c) => c.id === cliente.id)!.saldo).toBe(antes);
    const d = await rpc<{ pedido: { cobrado: boolean }; pagos: unknown[] }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    expect(d.pedido.cobrado).toBe(false);
    expect(d.pagos).toHaveLength(0);

    // los pagos anulados siguen en la tabla, con motivo y quién
    const filas = await db.query<{ anulado: boolean; anulado_motivo: string; anulado_por: string }>(`select anulado, anulado_motivo, anulado_por from public.pagos_pedido where pedido_id = $1`, [p.id]);
    expect(filas.rows).toHaveLength(1);
    expect(filas.rows[0].anulado).toBe(true);
    expect(filas.rows[0].anulado_motivo).toContain("Se equivocaron de cliente");
  });

  it("anular un pedido lo saca de las ventas del día", async () => {
    const antes = await inicio();
    const p = await pedidoNuevo([{ producto_id: plato("Hamburguesa sencilla").id }]); // 14.000
    await rpc(db, U, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 14000, recibido: 14000 }] });
    expect((await inicio()).ventas_hoy).toBe(antes.ventas_hoy + 14000);
    await rpc(db, U, "anular_pedido", { p_pedido_id: p.id, p_motivo: "Cliente devolvió el pedido" });
    expect((await inicio()).ventas_hoy).toBe(antes.ventas_hoy);
    await expect(rpc(db, U, "anular_pedido", { p_pedido_id: p.id, p_motivo: "otra vez" })).rejects.toThrow(/ya está anulado/);
  });

  it("anular un plato recalcula el total (solo antes de cobrar)", async () => {
    const p = await pedidoNuevo([{ producto_id: plato("Perro caliente").id }, { producto_id: plato("Gaseosa personal").id }]);
    const d = await rpc<{ items: { id: string; nombre: string }[] }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    const gaseosa = d.items.find((i) => i.nombre === "Gaseosa personal")!;
    await rpc(db, U, "anular_item_pedido", { p_item_id: gaseosa.id, p_motivo: "No quiso la gaseosa" });
    const d2 = await rpc<{ pedido: { total: number }; items: unknown[] }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    expect(d2.pedido.total).toBe(9000);
    expect(d2.items).toHaveLength(1);

    await rpc(db, U, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 9000, recibido: 9000 }] });
    await expect(rpc(db, U, "anular_item_pedido", { p_item_id: d2.items[0] && (d2.items[0] as { id: string }).id, p_motivo: "x" })).rejects.toThrow(/anula el cobro primero/);
  });
});

describe("fiado: abonos", () => {
  it("un abono baja el saldo; no puede pasarse de la deuda; se anula con motivo", async () => {
    const c = (await clientes()).find((x) => x.saldo > 10000)!;
    const r = await rpc<{ saldo: number }>(db, U, "registrar_abono", { p_cliente_id: c.id, p_monto: 10000, p_medio: "efectivo" });
    expect(r.saldo).toBe(c.saldo - 10000);

    await expect(rpc(db, U, "registrar_abono", { p_cliente_id: c.id, p_monto: c.saldo + 1, p_medio: "efectivo" })).rejects.toThrow(/mayor que lo que debe/);
    await expect(rpc(db, U, "registrar_abono", { p_cliente_id: c.id, p_monto: 0, p_medio: "efectivo" })).rejects.toThrow(/mayor que cero/);
    await expect(rpc(db, U, "registrar_abono", { p_cliente_id: c.id, p_monto: 1000, p_medio: "cheque" })).rejects.toThrow(/efectivo o por transferencia/);

    const ficha = await rpc<{ saldo: number; movimientos: { id: string; tipo: string; monto: number }[] }>(db, U, "obtener_cliente_fiado", { p_cliente_id: c.id });
    expect(ficha.saldo).toBe(c.saldo - 10000);
    const abono = ficha.movimientos.find((m) => m.tipo === "abono" && m.monto === 10000)!;
    const rr = await rpc<{ saldo: number }>(db, U, "anular_abono", { p_movimiento_id: abono.id, p_motivo: "Lo registré al cliente equivocado" });
    expect(rr.saldo).toBe(c.saldo);
  });

  it("crear cliente valida nombre y teléfono", async () => {
    await expect(rpc(db, U, "crear_cliente", { p_nombre: "  " })).rejects.toThrow(/nombre del cliente/);
    await expect(rpc(db, U, "crear_cliente", { p_nombre: "Pepe", p_telefono: "abc" })).rejects.toThrow(/teléfono no es válido/);
    const nuevo = await rpc<{ id: string; telefono: string }>(db, U, "crear_cliente", { p_nombre: "Pepe Pérez", p_telefono: "3101234567" });
    expect(nuevo.telefono).toBe("+573101234567");
    expect((await clientes()).find((c) => c.id === nuevo.id)?.saldo).toBe(0);
  });
});

describe("gastos y cierre del día", () => {
  it("un gasto suma a los gastos de hoy y al anularlo deja de sumar", async () => {
    const antes = await inicio();
    const g = await rpc<{ id: string }>(db, U, "registrar_gasto", { p_monto: 30000, p_categoria: "gas", p_nota: "Pipeta" });
    expect((await inicio()).gastos_hoy).toBe(antes.gastos_hoy + 30000);
    await expect(rpc(db, U, "registrar_gasto", { p_monto: 0, p_categoria: "gas" })).rejects.toThrow(/cuánto fue/);
    await expect(rpc(db, U, "registrar_gasto", { p_monto: 1000, p_categoria: "lujos" })).rejects.toThrow(/categoría/);
    await expect(rpc(db, U, "registrar_gasto", { p_monto: 1000, p_categoria: "gas", p_fecha: "2999-01-01" })).rejects.toThrow(/fecha/);
    await rpc(db, U, "anular_gasto", { p_gasto_id: g.id, p_motivo: "Monto mal digitado" });
    expect((await inicio()).gastos_hoy).toBe(antes.gastos_hoy);
    const lista = await rpc<{ gastos: { id: string; anulado: boolean; anulado_motivo: string }[] }>(db, U, "listar_gastos");
    expect(lista.gastos.find((x) => x.id === g.id)).toMatchObject({ anulado: true, anulado_motivo: "Monto mal digitado" });
  });

  it("la base acepta cada categoría de gasto de la interfaz (src/lib/gastos.ts)", async () => {
    for (const c of CATEGORIAS_GASTO) {
      await expect(rpc(db, U, "registrar_gasto", { p_monto: 1000, p_categoria: c.valor }), c.valor).resolves.toBeTruthy();
    }
  });

  it("un gasto que no salió de la caja no baja el efectivo esperado, pero sí la ganancia", async () => {
    const antes = (await rpc<{ resumen: Record<string, number> }>(db, U, "obtener_resumen_dia", { p_base: 0 })).resumen;
    await rpc(db, U, "registrar_gasto", { p_monto: 40000, p_categoria: "carnes", p_de_caja: false });
    const despues = (await rpc<{ resumen: Record<string, number> }>(db, U, "obtener_resumen_dia", { p_base: 0 })).resumen;
    expect(despues.gastos).toBe(antes.gastos + 40000);
    expect(despues.ganancia).toBe(antes.ganancia - 40000);
    expect(despues.efectivo_esperado).toBe(antes.efectivo_esperado);
  });

  it("el cierre calcula ganancia y efectivo esperado, guarda la diferencia y no se repite el mismo día", async () => {
    const { resumen } = await rpc<{ resumen: Record<string, number> }>(db, U, "obtener_resumen_dia", { p_base: 50000 });
    expect(resumen.ganancia).toBe(resumen.ventas - resumen.gastos);
    expect(resumen.efectivo_esperado).toBe(50000 + resumen.cobrado_efectivo + resumen.abonos_efectivo - resumen.gastos_caja);

    const c = await rpc<{ id: string; diferencia: number }>(db, U, "registrar_cierre", {
      p_fecha: null, p_base_caja: 50000, p_efectivo_contado: resumen.efectivo_esperado - 3000, p_notas: "Faltaron 3 mil",
    });
    expect(c.diferencia).toBe(-3000);
    await expect(
      rpc(db, U, "registrar_cierre", { p_fecha: null, p_base_caja: 50000, p_efectivo_contado: 1 })
    ).rejects.toThrow(/ya está cerrado/);
    await expect(rpc(db, U, "registrar_cierre", { p_fecha: "2999-01-01", p_base_caja: 0, p_efectivo_contado: 1 })).rejects.toThrow(/todavía no llega/);

    await rpc(db, U, "anular_cierre", { p_cierre_id: c.id, p_motivo: "Conté mal" });
    await expect(
      rpc(db, U, "registrar_cierre", { p_fecha: null, p_base_caja: 50000, p_efectivo_contado: resumen.efectivo_esperado })
    ).resolves.toMatchObject({ diferencia: 0 });
  });
});

describe("menú (administración)", () => {
  it("cambiar un precio no altera lo ya vendido", async () => {
    const perro = plato("Perro caliente");
    const p = await pedidoNuevo([{ producto_id: perro.id }]);
    await rpc(db, U, "guardar_producto", { p_id: perro.id, p_categoria_id: perro.categoria_id, p_nombre: "Perro caliente", p_precio: 10000 });
    const viejo = await rpc<{ pedido: { total: number } }>(db, U, "obtener_pedido", { p_pedido_id: p.id });
    expect(viejo.pedido.total).toBe(9000);
    expect((await pedidoNuevo([{ producto_id: perro.id }])).total).toBe(10000);
  });

  it("crear plato y categoría, nombre repetido rechazado, archivar oculta el plato", async () => {
    const cat = await rpc<{ id: string }>(db, U, "guardar_categoria", { p_id: null, p_nombre: "Postres", p_icono: "🍰" });
    await expect(rpc(db, U, "guardar_categoria", { p_id: null, p_nombre: "postres" })).rejects.toThrow(/Ya hay una categoría/);
    const prod = await rpc<{ id: string }>(db, U, "guardar_producto", { p_id: null, p_categoria_id: cat.id, p_nombre: "Brownie", p_precio: 6000 });
    await expect(rpc(db, U, "guardar_producto", { p_id: null, p_categoria_id: cat.id, p_nombre: "", p_precio: 1 })).rejects.toThrow(/nombre del plato/);
    await expect(rpc(db, U, "guardar_producto", { p_id: null, p_categoria_id: cat.id, p_nombre: "X", p_precio: -5 })).rejects.toThrow(/precio/);

    let m = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
    expect(m.productos.find((x) => x.id === prod.id)?.precio).toBe(6000);

    await rpc(db, U, "guardar_producto", { p_id: prod.id, p_categoria_id: cat.id, p_nombre: "Brownie", p_precio: 6000, p_activo: false });
    m = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
    expect(m.productos.find((x) => x.id === prod.id)).toBeUndefined();
    await expect(pedidoNuevo([{ producto_id: prod.id }])).rejects.toThrow(/ya no existe/);
  });
});

describe("reiniciar la demo", () => {
  it("borra lo creado y vuelve a los datos de ejemplo", async () => {
    await pedidoNuevo([{ producto_id: plato("Perro caliente").id }]);
    await rpc(db, U, "registrar_gasto", { p_monto: 999, p_categoria: "otros" });
    await rpc(db, U, "reiniciar_demo");
    const m = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
    expect(m.productos).toHaveLength(25);
    expect(m.categorias.map((c) => c.nombre)).not.toContain("Postres");
    const lista = await rpc<{ id: string }[]>(db, U, "listar_pedidos_pendientes");
    expect(lista).toHaveLength(4);
    const g = await rpc<{ gastos: { monto: number }[] }>(db, U, "listar_gastos");
    expect(g.gastos.some((x) => x.monto === 999)).toBe(false);
  });
});
