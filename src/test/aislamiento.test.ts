/**
 * PRUEBA CLAVE DE SEGURIDAD: un usuario del restaurante A no puede leer NI tocar datos del restaurante B,
 * ni sin sesión se puede ver nada. Corre contra Postgres real (PGlite) con las migraciones reales.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };

const TABLAS_NEGOCIO = [
  "categorias_producto", "productos", "modificadores", "mesas", "clientes", "pedidos",
  "pedido_items", "pagos_pedido", "movimientos_fiado", "gastos", "cierres_dia",
];

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Restaurante A");
  B = await crearRestauranteDemo(db, "Restaurante B");
});
afterAll(() => db.close());

/** Ids de una tabla del restaurante B, leídos como superusuario (para atacar con ellos desde A). */
async function idsDeB(tabla: string, limite = 1): Promise<string[]> {
  const r = await db.query<{ id: string }>(`select id from public.${tabla} where restaurante_id = $1 limit ${limite}`, [B.restauranteId]);
  return r.rows.map((x) => x.id);
}

describe("RLS: toda tabla de public la tiene activada", () => {
  it("ninguna tabla queda sin RLS (cubre también las que se agreguen después)", async () => {
    const r = await db.query<{ tabla: string }>(
      `select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    );
    expect(r.rows).toEqual([]);
  });

  it("toda tabla de negocio tiene restaurante_id NOT NULL", async () => {
    const r = await db.query<{ tabla: string }>(
      `select t.table_name as tabla from information_schema.tables t
        where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
          and t.table_name not in ('restaurantes', 'perfiles')
          and not exists (select 1 from information_schema.columns c
                           where c.table_schema = 'public' and c.table_name = t.table_name
                             and c.column_name = 'restaurante_id' and c.is_nullable = 'NO')`
    );
    expect(r.rows).toEqual([]);
  });
});

describe("lectura: A solo ve lo suyo", () => {
  it.each(TABLAS_NEGOCIO)("%s: A no ve ninguna fila de B", async (tabla) => {
    const filas = await como<{ restaurante_id: string }>(db, A.userId, `select restaurante_id from public.${tabla}`);
    expect(filas.length).toBeGreaterThan(0); // sí ve lo suyo...
    expect(new Set(filas.map((f) => f.restaurante_id))).toEqual(new Set([A.restauranteId])); // ...y solo lo suyo
  });

  it("restaurantes y perfiles: solo el propio", async () => {
    const r = await como<{ id: string }>(db, A.userId, `select id from public.restaurantes`);
    expect(r.map((x) => x.id)).toEqual([A.restauranteId]);
    const p = await como<{ user_id: string }>(db, A.userId, `select user_id from public.perfiles`);
    expect(p.map((x) => x.user_id)).toEqual([A.userId]);
  });

  it("pedir por id una fila de B devuelve vacío", async () => {
    for (const tabla of TABLAS_NEGOCIO) {
      const [id] = await idsDeB(tabla);
      const filas = await como(db, A.userId, `select 1 from public.${tabla} where id = $1`, [id]);
      expect(filas, tabla).toHaveLength(0);
    }
  });

  it("las funciones de lectura devuelven solo datos de A", async () => {
    const clientesA = await rpc<{ id: string }[]>(db, A.userId, "listar_clientes");
    const idsClientesB = await idsDeB("clientes", 8);
    expect(clientesA.some((c) => idsClientesB.includes(c.id))).toBe(false);

    const menuA = await rpc<{ productos: { id: string }[] }>(db, A.userId, "obtener_menu_para_pedido");
    const idsProdB = await idsDeB("productos", 25);
    expect(menuA.productos.some((p) => idsProdB.includes(p.id))).toBe(false);

    const [pedidoB] = await idsDeB("pedidos");
    await expect(rpc(db, A.userId, "obtener_pedido", { p_pedido_id: pedidoB })).rejects.toThrow(/no existe/);
    const [clienteB] = await idsDeB("clientes");
    await expect(rpc(db, A.userId, "obtener_cliente_fiado", { p_cliente_id: clienteB })).rejects.toThrow(/no existe/);
  });
});

describe("escritura directa: ningún usuario puede insertar, actualizar ni borrar tablas", () => {
  it.each(TABLAS_NEGOCIO)("%s: INSERT/UPDATE/DELETE directos son rechazados", async (tabla) => {
    await expect(como(db, A.userId, `insert into public.${tabla} (restaurante_id) values ($1)`, [A.restauranteId])).rejects.toThrow(/permission denied/);
    await expect(como(db, A.userId, `update public.${tabla} set restaurante_id = restaurante_id`)).rejects.toThrow(/permission denied/);
    await expect(como(db, A.userId, `delete from public.${tabla}`)).rejects.toThrow(/permission denied/);
  });

  it("no puede mover sus datos al restaurante B ni crear filas en B", async () => {
    await expect(
      como(db, A.userId, `insert into public.gastos (restaurante_id, monto, categoria) values ($1, 1000, 'otros')`, [B.restauranteId])
    ).rejects.toThrow(/permission denied/);
    await expect(
      como(db, A.userId, `update public.pedidos set restaurante_id = $1`, [B.restauranteId])
    ).rejects.toThrow(/permission denied/);
  });

  it("ni el dueño de la base puede borrar pedidos, pagos o gastos (anular, no borrar)", async () => {
    for (const tabla of ["pedidos", "pedido_items", "pagos_pedido", "movimientos_fiado", "gastos", "cierres_dia"]) {
      await expect(db.query(`delete from public.${tabla}`), tabla).rejects.toThrow(/se anula con motivo/);
    }
  });
});

describe("funciones de escritura: A no puede tocar ids de B", () => {
  it("anular, cobrar, cambiar estado y agregar ítems sobre un pedido de B fallan y B queda intacto", async () => {
    const antes = await db.query(`select * from public.pedidos where restaurante_id = $1 order by id`, [B.restauranteId]);
    const [pedidoB] = await idsDeB("pedidos");
    const [pendienteB] = (
      await db.query<{ id: string }>(`select id from public.pedidos where restaurante_id = $1 and cobrado_at is null and not anulado limit 1`, [B.restauranteId])
    ).rows.map((r) => r.id);
    const [productoB] = await idsDeB("productos");

    await expect(rpc(db, A.userId, "anular_pedido", { p_pedido_id: pedidoB, p_motivo: "ataque" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, A.userId, "anular_cobro", { p_pedido_id: pedidoB, p_motivo: "ataque" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: pendienteB, p_estado: "listo" })).rejects.toThrow(/no existe/);
    await expect(
      rpc(db, A.userId, "cobrar_pedido", { p_pedido_id: pendienteB, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: 1000 }] })
    ).rejects.toThrow(/no existe/);
    await expect(
      rpc(db, A.userId, "agregar_items_pedido", { p_pedido_id: pendienteB, p_items: [{ producto_id: productoB, cantidad: 1 }] })
    ).rejects.toThrow(/no existe/);

    const despues = await db.query(`select * from public.pedidos where restaurante_id = $1 order by id`, [B.restauranteId]);
    expect(despues.rows).toEqual(antes.rows);
  });

  it("A no puede usar platos, mesas, adiciones ni clientes de B en sus pedidos", async () => {
    const [productoB] = await idsDeB("productos");
    const [mesaB] = await idsDeB("mesas");
    const [clienteB] = await idsDeB("clientes");
    const [modificadorB] = await idsDeB("modificadores");
    const menuA = await rpc<{ productos: { id: string }[]; mesas: { id: string }[] }>(db, A.userId, "obtener_menu_para_pedido");
    const platoA = menuA.productos[0].id;

    await expect(rpc(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: productoB, cantidad: 1 }] })).rejects.toThrow(/ya no existe/);
    await expect(rpc(db, A.userId, "crear_pedido", { p_tipo: "mesa", p_mesa_id: mesaB, p_items: [{ producto_id: platoA, cantidad: 1 }] })).rejects.toThrow(/mesa no existe/);
    await expect(
      rpc(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: platoA, cantidad: 1, adiciones: [modificadorB] }] })
    ).rejects.toThrow(/adición/);

    const nuevo = await rpc<{ id: string; total: number }>(db, A.userId, "crear_pedido", { p_tipo: "mesa", p_mesa_id: menuA.mesas[0].id, p_items: [{ producto_id: platoA, cantidad: 1 }] });
    await expect(
      rpc(db, A.userId, "cobrar_pedido", { p_pedido_id: nuevo.id, p_propina: 0, p_pagos: [{ medio: "fiado", monto: nuevo.total, cliente_id: clienteB }] })
    ).rejects.toThrow(/cliente no existe/);
    await expect(rpc(db, A.userId, "registrar_abono", { p_cliente_id: clienteB, p_monto: 1000, p_medio: "efectivo" })).rejects.toThrow(/cliente no existe/);
  });

  it("A no puede anular gastos, cierres ni abonos de B, ni editar su menú", async () => {
    const [gastoB] = await idsDeB("gastos");
    const [cierreB] = await idsDeB("cierres_dia");
    const [productoB] = await idsDeB("productos");
    const [categoriaB] = await idsDeB("categorias_producto");
    const [abonoB] = (
      await db.query<{ id: string }>(`select id from public.movimientos_fiado where restaurante_id = $1 and tipo = 'abono' limit 1`, [B.restauranteId])
    ).rows.map((r) => r.id);

    await expect(rpc(db, A.userId, "anular_gasto", { p_gasto_id: gastoB, p_motivo: "ataque" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, A.userId, "anular_cierre", { p_cierre_id: cierreB, p_motivo: "ataque" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, A.userId, "anular_abono", { p_movimiento_id: abonoB, p_motivo: "ataque" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, A.userId, "cambiar_disponibilidad", { p_producto_id: productoB, p_disponible: false })).rejects.toThrow(/no existe/);
    await expect(
      rpc(db, A.userId, "guardar_producto", { p_id: productoB, p_categoria_id: categoriaB, p_nombre: "Hackeado", p_precio: 1 })
    ).rejects.toThrow(/Elige una categoría/);
    await expect(
      rpc(db, A.userId, "guardar_categoria", { p_id: categoriaB, p_nombre: "Hackeada" })
    ).rejects.toThrow(/no existe/);

    const intacto = await db.query<{ nombre: string; disponible: boolean }>(`select nombre, disponible from public.productos where id = $1`, [productoB]);
    expect(intacto.rows[0].nombre).not.toBe("Hackeado");
    expect(intacto.rows[0].disponible).toBe(true);
  });

  it("la foto de un gasto debe estar en la carpeta del propio restaurante", async () => {
    await expect(
      rpc(db, A.userId, "registrar_gasto", { p_monto: 5000, p_categoria: "otros", p_foto_path: `${B.restauranteId}/factura.jpg` })
    ).rejects.toThrow(/foto no es válida/);
    await expect(
      rpc(db, A.userId, "registrar_gasto", { p_monto: 5000, p_categoria: "otros", p_foto_path: `${A.restauranteId}/factura.jpg` })
    ).resolves.toBeTruthy();
  });

  it("reiniciar la demo de A no toca los datos de B", async () => {
    const contar = async (rest: string) =>
      (await db.query<{ n: number }>(`select (select count(*) from public.pedidos where restaurante_id = $1)::int as n`, [rest])).rows[0].n;
    const antesB = await contar(B.restauranteId);
    await rpc(db, A.userId, "reiniciar_demo");
    expect(await contar(B.restauranteId)).toBe(antesB);
  });
});

describe("sin sesión o sin restaurante: nada", () => {
  it("anon no lee ninguna tabla", async () => {
    for (const tabla of [...TABLAS_NEGOCIO, "restaurantes", "perfiles"]) {
      await expect(como(db, null, `select * from public.${tabla}`), tabla).rejects.toThrow(/permission denied/);
    }
  });

  it("anon no ejecuta ninguna función pública", async () => {
    await expect(rpc(db, null, "obtener_inicio")).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [] })).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "reiniciar_demo")).rejects.toThrow(/permission denied/);
  });

  it("un usuario sin perfil no ve filas y sus escrituras se rechazan", async () => {
    const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('huerfano@ejemplo.test') returning id`);
    const huerfano = u.rows[0].id;
    for (const tabla of TABLAS_NEGOCIO) {
      expect(await como(db, huerfano, `select 1 from public.${tabla}`), tabla).toHaveLength(0);
    }
    await expect(rpc(db, huerfano, "crear_cliente", { p_nombre: "X" })).rejects.toThrow(/no tiene un restaurante/);
    await expect(rpc(db, huerfano, "reiniciar_demo")).rejects.toThrow(/no tiene un restaurante/);
  });

  it("las funciones internas (fn_*, requerir_*) no son ejecutables por usuarios", async () => {
    const r = await db.query<{ nombre: string; anon: boolean; auth: boolean }>(
      `select p.proname as nombre,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'`
    );
    expect(r.rows.length).toBeGreaterThan(30);
    for (const f of r.rows) {
      expect(f.anon, `${f.nombre} no debe ser ejecutable por anon`).toBe(false);
      const interna = f.nombre.startsWith("fn_") || f.nombre.startsWith("requerir_");
      expect(f.auth, `${f.nombre}: ${interna ? "interna, sin acceso" : "pública, con acceso"}`).toBe(!interna);
    }
  });

  it("solo el dueño puede editar el menú (un ayudante no)", async () => {
    const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('ayudante@ejemplo.test') returning id`);
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante')`, [u.rows[0].id, A.restauranteId]);
    await expect(rpc(db, u.rows[0].id, "guardar_categoria", { p_id: null, p_nombre: "Nueva" })).rejects.toThrow(/Solo el dueño/);
    await expect(rpc(db, u.rows[0].id, "reiniciar_demo")).rejects.toThrow(/Solo el dueño/);
    // pero sí puede marcar "se acabó" y trabajar con pedidos
    const menu = await rpc<{ productos: { id: string }[] }>(db, u.rows[0].id, "obtener_menu_para_pedido");
    await expect(rpc(db, u.rows[0].id, "cambiar_disponibilidad", { p_producto_id: menu.productos[0].id, p_disponible: false })).resolves.toBeTruthy();
    await rpc(db, u.rows[0].id, "cambiar_disponibilidad", { p_producto_id: menu.productos[0].id, p_disponible: true });
  });
});
