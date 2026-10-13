/**
 * Trabajo sin conexión, lado base de datos: aplicar_operacion() aplica cada operación UNA sola vez (clave),
 * respeta CUÁNDO ocurrió y no abre ninguna puerta nueva entre restaurantes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Menu = {
  productos: { id: string; nombre: string; precio: number }[];
  mesas: { id: string; nombre: string; pedido_abierto: string | null }[];
};

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };
let menuA: Menu;

const uuid = () => crypto.randomUUID();
const plato = (nombre: string) => menuA.productos.find((p) => p.nombre === nombre)!;
const op = <T = Record<string, unknown>>(actor: string | null, tipo: string, args: Record<string, unknown>, clave = uuid(), ocurrido: string | null = null) =>
  rpc<T>(db, actor, "aplicar_operacion", { p_clave: clave, p_tipo: tipo, p_args: args, ...(ocurrido ? { p_ocurrido_en: ocurrido } : {}) });
const una = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();

const pedidoArgs = (id: string, extra: Record<string, unknown> = {}) => ({
  p_id: id,
  p_tipo: "llevar",
  p_mesa_id: null,
  p_items: [{ producto_id: plato("Perro caliente").id, cantidad: 2 }],
  p_contacto_nombre: "Camilo",
  ...extra,
});

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Sin conexión A");
  B = await crearRestauranteDemo(db, "Sin conexión B");
  menuA = await rpc<Menu>(db, A.userId, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("aplicar_operacion: una sola vez", () => {
  it("crear_pedido usa el id que eligió el celular y repetir la clave no duplica nada", async () => {
    const id = uuid();
    const clave = uuid();
    const primero = await op<{ id: string; numero: number; total: number }>(A.userId, "crear_pedido", pedidoArgs(id), clave);
    expect(primero.id).toBe(id);
    expect(primero.total).toBe(2 * plato("Perro caliente").precio);

    const otra = await op<{ id: string; numero: number }>(A.userId, "crear_pedido", pedidoArgs(id), clave); // reintento
    expect(otra).toEqual(primero);
    const n = await una<{ n: number }>(`select count(*)::int as n from public.pedidos where id = $1`, [id]);
    expect(n.n).toBe(1);
    const items = await una<{ n: number }>(`select count(*)::int as n from public.pedido_items where pedido_id = $1`, [id]);
    expect(items.n).toBe(1);
  });

  it("el consecutivo lo asigna el servidor, en el orden en que llegan", async () => {
    const a = await op<{ numero: number }>(A.userId, "crear_pedido", pedidoArgs(uuid()));
    const b = await op<{ numero: number }>(A.userId, "crear_pedido", pedidoArgs(uuid()));
    expect(b.numero).toBe(a.numero + 1);
  });

  it("si la operación falla no queda la clave: se puede reintentar corregida", async () => {
    const id = uuid();
    await op(A.userId, "crear_pedido", pedidoArgs(id));
    const clave = uuid();
    // los pagos no suman el total: la base rechaza y NO guarda la clave
    await expect(op(A.userId, "cobrar", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 1 }] }, clave)).rejects.toThrow(/suman/);
    const pendiente = await una<{ n: number }>(`select count(*)::int as n from public.operaciones_aplicadas where clave = $1`, [clave]);
    expect(pendiente.n).toBe(0);
    const total = 2 * plato("Perro caliente").precio;
    const ok = await op<{ cobrado: number }>(A.userId, "cobrar", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: total, recibido: total + 1000 }] }, clave);
    expect(ok.cobrado).toBe(total);
  });

  it("cobrar dos veces con la misma clave cobra una sola vez y devuelve el mismo vuelto", async () => {
    const id = uuid();
    await op(A.userId, "crear_pedido", pedidoArgs(id));
    const total = 2 * plato("Perro caliente").precio;
    const clave = uuid();
    const args = { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: total, recibido: total + 2000 }] };
    const uno = await op<{ vuelto: number }>(A.userId, "cobrar", args, clave);
    const dos = await op<{ vuelto: number }>(A.userId, "cobrar", args, clave);
    expect(uno.vuelto).toBe(2000);
    expect(dos).toEqual(uno);
    const pagos = await una<{ n: number }>(`select count(*)::int as n from public.pagos_pedido where pedido_id = $1`, [id]);
    expect(pagos.n).toBe(1);
    // con otra clave sí es otro intento: la base dice que ya está cobrado
    await expect(op(A.userId, "cobrar", args)).rejects.toThrow(/ya está cobrado/);
  });

  it("dos envíos simultáneos de la misma clave se aplican una vez", async () => {
    const id = uuid();
    const clave = uuid();
    const [x, y] = await Promise.all([
      op<{ id: string }>(A.userId, "crear_pedido", pedidoArgs(id), clave),
      op<{ id: string }>(A.userId, "crear_pedido", pedidoArgs(id), clave),
    ]);
    expect(x.id).toBe(id);
    expect(y.id).toBe(id);
    const n = await una<{ n: number }>(`select count(*)::int as n from public.pedidos where id = $1`, [id]);
    expect(n.n).toBe(1);
  });
});

describe("aplicar_operacion: cuándo ocurrió", () => {
  it("un cobro hecho ayer sin señal cuenta en el día de ayer", async () => {
    const id = uuid();
    const ayer = hace(26);
    await op(A.userId, "crear_pedido", pedidoArgs(id), uuid(), ayer);
    await op(A.userId, "cambiar_estado", { p_pedido_id: id, p_estado: "listo" }, uuid(), ayer);
    await op(A.userId, "cambiar_estado", { p_pedido_id: id, p_estado: "entregado" }, uuid(), ayer);
    const total = 2 * plato("Perro caliente").precio;
    await op(A.userId, "cobrar", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "transferencia", monto: total }] }, uuid(), ayer);

    // La jornada sale de CUÁNDO ocurrió (no de cuándo se subió): la misma que da la base para ese instante.
    const f = await una<{ fecha: string; fecha_cobro: string; esperada: string; creado_ayer: boolean; listo: boolean }>(
      `select p.fecha::text, p.fecha_cobro::text, public.fn_jornada(p.restaurante_id, $2::timestamptz)::text as esperada,
              (p.created_at < now() - interval '25 hours') as creado_ayer,
              (p.listo_at is not null and p.entregado_at is not null) as listo
         from public.pedidos p where p.id = $1`,
      [id, ayer]
    );
    expect(f.fecha).toBe(f.fecha_cobro);
    expect(f.fecha).toBe(f.esperada);
    expect(f.creado_ayer).toBe(true);
    expect(f.listo).toBe(true);
    const pago = await una<{ fecha: string }>(`select fecha::text from public.pagos_pedido where pedido_id = $1`, [id]);
    expect(pago.fecha).toBe(f.fecha);
  });

  it("un gasto y un abono hechos ayer quedan en ayer", async () => {
    const ayer = hace(25);
    const g = await op<{ id: string }>(A.userId, "gasto", { p_monto: 12345, p_categoria: "gas", p_nota: "sin señal" }, uuid(), ayer);
    const gasto = await una<{ fecha: string; esperada: string }>(
      `select fecha::text, public.fn_jornada(restaurante_id, $2::timestamptz)::text as esperada from public.gastos where id = $1`,
      [g.id, ayer]
    );
    expect(gasto.fecha).toBe(gasto.esperada);

    const clientes = await rpc<{ id: string; saldo: number }[]>(db, A.userId, "listar_clientes");
    const deudor = clientes.find((c) => c.saldo > 1000)!;
    const ab = await op<{ id: string }>(A.userId, "abonar", { p_cliente_id: deudor.id, p_monto: 1000, p_medio: "efectivo" }, uuid(), ayer);
    const mov = await una<{ fecha: string; esperada: string }>(
      `select fecha::text, public.fn_jornada(restaurante_id, $2::timestamptz)::text as esperada from public.movimientos_fiado where id = $1`,
      [ab.id, ayer]
    );
    expect(mov.fecha).toBe(mov.esperada);
  });

  it("un reloj adelantado se limita a ahora y lo de hace más de 7 días se rechaza", async () => {
    const id = uuid();
    await op(A.userId, "crear_pedido", pedidoArgs(id), uuid(), new Date(Date.now() + 5 * 3_600_000).toISOString());
    const p = await una<{ futuro: boolean }>(`select (created_at > now() + interval '1 second') as futuro from public.pedidos where id = $1`, [id]);
    expect(p.futuro).toBe(false);
    await expect(op(A.userId, "crear_pedido", pedidoArgs(uuid()), uuid(), hace(24 * 8))).rejects.toThrow(/más de 7 días/);
  });
});

describe("aplicar_operacion: cada tipo", () => {
  it("agregar platos, cliente nuevo con id propio, fiado y abono", async () => {
    const id = uuid();
    await op(A.userId, "crear_pedido", pedidoArgs(id));
    const mas = await op<{ total: number }>(A.userId, "agregar_items", { p_pedido_id: id, p_items: [{ producto_id: plato("Perro americano").id, cantidad: 1 }] });
    expect(mas.total).toBe(2 * plato("Perro caliente").precio + plato("Perro americano").precio);

    const cli = uuid();
    const nuevo = await op<{ id: string; telefono: string }>(A.userId, "crear_cliente", { p_id: cli, p_nombre: "Don Hernán", p_telefono: "310 444 5566" });
    expect(nuevo.id).toBe(cli);
    expect(nuevo.telefono).toBe("+573104445566");

    await op(A.userId, "cobrar", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "fiado", monto: mas.total, cliente_id: cli }] });
    const ab = await op<{ saldo: number }>(A.userId, "abonar", { p_cliente_id: cli, p_monto: 5000, p_medio: "transferencia", p_referencia: "M1" });
    expect(ab.saldo).toBe(mas.total - 5000);
  });

  it("un tipo desconocido se rechaza", async () => {
    await expect(op(A.userId, "borrar_todo", {})).rejects.toThrow(/no es válida/);
  });
});

describe("aplicar_operacion: seguridad", () => {
  it("sin sesión no se puede ejecutar", async () => {
    await expect(op(null, "gasto", { p_monto: 100, p_categoria: "gas" })).rejects.toThrow(/permission denied/);
  });

  it("la clave de A no devuelve nada de A a B (cada restaurante tiene las suyas)", async () => {
    const clave = uuid();
    const deA = await op<{ id: string }>(A.userId, "crear_pedido", pedidoArgs(uuid()), clave);
    const menuB = await rpc<Menu>(db, B.userId, "obtener_menu_para_pedido");
    const deB = await op<{ id: string }>(
      B.userId,
      "crear_pedido",
      { p_id: uuid(), p_tipo: "llevar", p_items: [{ producto_id: menuB.productos[0].id, cantidad: 1 }] },
      clave
    );
    expect(deB.id).not.toBe(deA.id);
    const dueno = await una<{ restaurante_id: string }>(`select restaurante_id from public.pedidos where id = $1`, [deB.id]);
    expect(dueno.restaurante_id).toBe(B.restauranteId);
  });

  it("B no puede cobrar, mover ni abonar cosas de A por esta vía", async () => {
    const id = uuid();
    await op(A.userId, "crear_pedido", pedidoArgs(id));
    await expect(op(B.userId, "cambiar_estado", { p_pedido_id: id, p_estado: "listo" })).rejects.toThrow(/no existe/);
    await expect(op(B.userId, "cobrar", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 100 }] })).rejects.toThrow(/no existe/);
    const clientesA = await rpc<{ id: string }[]>(db, A.userId, "listar_clientes");
    await expect(op(B.userId, "abonar", { p_cliente_id: clientesA[0].id, p_monto: 1, p_medio: "efectivo" })).rejects.toThrow(/no existe/);
  });

  it("los clientes no pueden leer ni escribir la tabla de claves", async () => {
    await expect(como(db, A.userId, `select * from public.operaciones_aplicadas`)).rejects.toThrow(/permission denied/);
    await expect(
      como(db, A.userId, `insert into public.operaciones_aplicadas (restaurante_id, clave, tipo, resultado) values ($1, gen_random_uuid(), 'x', '{}')`, [A.restauranteId])
    ).rejects.toThrow(/permission denied/);
  });
});
