/**
 * Migración 15, sobre Postgres real (PGlite): mesas y adiciones que el dueño administra desde la app, y el PIN que
 * evita que cualquiera con el enlace reinicie la demo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Mesa = { id: string; nombre: string; orden: number; ocupada: boolean };
type Menu = {
  categorias: { id: string; nombre: string }[];
  productos: { id: string; categoria_id: string; nombre: string }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  mesas: { id: string; nombre: string; pedido_abierto: string | null }[];
};
type Reinicio = { ok: boolean; motivo?: string; minutos?: number; intentos_restantes?: number };

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };
let ayudante: string;

const mesas = (actor = A.userId) => rpc<Mesa[]>(db, actor, "listar_mesas_admin");
const menu = (actor = A.userId) => rpc<Menu>(db, actor, "obtener_menu_para_pedido");
const guardarMesa = (args: Record<string, unknown>, actor = A.userId) => rpc<{ id: string; recuperada?: boolean }>(db, actor, "guardar_mesa", { p_id: null, ...args });

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Mesas A");
  B = await crearRestauranteDemo(db, "Mesas B");
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('ayudante-mesas@ejemplo.test') returning id`);
  ayudante = u.rows[0].id;
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante')`, [ayudante, A.restauranteId]);
});
afterAll(() => db.close());

describe("mesas", () => {
  it("lista las mesas activas con su estado (ocupada = tiene un pedido sin cobrar)", async () => {
    const lista = await mesas();
    expect(lista.map((m) => m.nombre)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6"]);
    // La demo deja dos pedidos de mesa sin cobrar (Mesa 5 y Mesa 2).
    expect(lista.filter((m) => m.ocupada).map((m) => m.nombre)).toEqual(["Mesa 2", "Mesa 5"]);
  });

  it("crear: va al final, sale al tomar pedidos, y no acepta nombres vacíos ni repetidos", async () => {
    const nueva = await guardarMesa({ p_nombre: "  Terraza   1 " });
    const lista = await mesas();
    expect(lista.at(-1)).toMatchObject({ id: nueva.id, nombre: "Terraza 1", ocupada: false });
    expect((await menu()).mesas.some((m) => m.id === nueva.id)).toBe(true);

    await expect(guardarMesa({ p_nombre: "   " })).rejects.toThrow(/nombre de la mesa/);
    await expect(guardarMesa({ p_nombre: "terraza 1" })).rejects.toThrow(/Ya hay una mesa/);
    await expect(guardarMesa({ p_id: nueva.id, p_nombre: "MESA 1" })).rejects.toThrow(/Ya hay una mesa/);
  });

  it("renombrar y quitar; una mesa quitada vuelve si se crea de nuevo con su nombre", async () => {
    const barra = await guardarMesa({ p_nombre: "Barra" });
    await guardarMesa({ p_id: barra.id, p_nombre: "Barra del fondo" });
    expect((await mesas()).find((m) => m.id === barra.id)?.nombre).toBe("Barra del fondo");

    await guardarMesa({ p_id: barra.id, p_nombre: "Barra del fondo", p_activa: false });
    expect((await mesas()).some((m) => m.id === barra.id)).toBe(false);
    expect((await menu()).mesas.some((m) => m.id === barra.id)).toBe(false);
    await expect(rpc(db, A.userId, "crear_pedido", { p_tipo: "mesa", p_mesa_id: barra.id, p_items: [{ producto_id: (await menu()).productos[0].id }] })).rejects.toThrow(/mesa no existe/);

    const otraVez = await guardarMesa({ p_nombre: "barra del fondo" });
    expect(otraVez).toMatchObject({ id: barra.id, recuperada: true });
    expect((await mesas()).at(-1)?.id).toBe(barra.id);
  });

  it("una mesa con un pedido sin cobrar no se puede quitar (pero sí renombrar)", async () => {
    const ocupada = (await mesas()).find((m) => m.ocupada)!;
    await expect(guardarMesa({ p_id: ocupada.id, p_nombre: ocupada.nombre, p_activa: false })).rejects.toThrow(/pedido sin cobrar/);
    await expect(guardarMesa({ p_id: ocupada.id, p_nombre: `${ocupada.nombre} (ventana)` })).resolves.toMatchObject({ id: ocupada.id });
    await guardarMesa({ p_id: ocupada.id, p_nombre: ocupada.nombre });
  });

  it("solo el dueño, y cada restaurante las suyas", async () => {
    await expect(guardarMesa({ p_nombre: "Del ayudante" }, ayudante)).rejects.toThrow(/Solo el dueño/);
    expect(await mesas(ayudante)).toHaveLength((await mesas()).length); // verlas sí puede
    const deB = (await mesas(B.userId))[0];
    await expect(guardarMesa({ p_id: deB.id, p_nombre: "Hackeada" })).rejects.toThrow(/mesa no existe/);
    await expect(rpc(db, null, "listar_mesas_admin")).rejects.toThrow(/permission denied/);
    expect((await mesas(B.userId))[0].nombre).toBe(deB.nombre);
  });
});

describe("adiciones (guardar_modificador ya existía; ahora tiene pantalla)", () => {
  it("crear una para una categoría y otra para cualquier plato; cambiarle el precio; quitarla", async () => {
    const m = await menu();
    const perros = m.categorias.find((c) => c.nombre === "Perros")!;
    const nueva = await rpc<{ id: string }>(db, A.userId, "guardar_modificador", { p_id: null, p_categoria_id: perros.id, p_nombre: " Ripio de papa ", p_precio_extra: 1000 });
    const general = await rpc<{ id: string }>(db, A.userId, "guardar_modificador", { p_id: null, p_categoria_id: null, p_nombre: "Para llevar (empaque)", p_precio_extra: 0 });

    let admin = await rpc<{ modificadores: Menu["modificadores"] }>(db, A.userId, "listar_menu_admin");
    expect(admin.modificadores.find((x) => x.id === nueva.id)).toMatchObject({ categoria_id: perros.id, nombre: "Ripio de papa", precio_extra: 1000 });
    expect(admin.modificadores.find((x) => x.id === general.id)).toMatchObject({ categoria_id: null, precio_extra: 0 });

    await rpc(db, A.userId, "guardar_modificador", { p_id: nueva.id, p_categoria_id: perros.id, p_nombre: "Ripio de papa", p_precio_extra: 1500 });
    const perro = m.productos.find((p) => p.nombre === "Perro caliente")!;
    const pedido = await rpc<{ id: string; total: number }>(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: perro.id, adiciones: [nueva.id, general.id] }] });
    expect(pedido.total).toBe(9000 + 1500);

    // Quitarla la saca del menú, pero el pedido que ya la llevaba la conserva.
    await rpc(db, A.userId, "guardar_modificador", { p_id: nueva.id, p_categoria_id: perros.id, p_nombre: "Ripio de papa", p_precio_extra: 1500, p_activo: false });
    admin = await rpc<{ modificadores: Menu["modificadores"] }>(db, A.userId, "listar_menu_admin");
    expect(admin.modificadores.some((x) => x.id === nueva.id)).toBe(false);
    await expect(rpc(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: perro.id, adiciones: [nueva.id] }] })).rejects.toThrow(/adición/);
    const detalle = await rpc<{ items: { adiciones: { nombre: string }[] }[] }>(db, A.userId, "obtener_pedido", { p_pedido_id: pedido.id });
    expect(detalle.items[0].adiciones.map((a) => a.nombre)).toContain("Ripio de papa");
  });

  it("valida nombre y precio, y es solo del dueño", async () => {
    await expect(rpc(db, A.userId, "guardar_modificador", { p_id: null, p_categoria_id: null, p_nombre: " ", p_precio_extra: 0 })).rejects.toThrow(/nombre de la adición/);
    await expect(rpc(db, A.userId, "guardar_modificador", { p_id: null, p_categoria_id: null, p_nombre: "X", p_precio_extra: -1 })).rejects.toThrow(/precio/);
    await expect(rpc(db, ayudante, "guardar_modificador", { p_id: null, p_categoria_id: null, p_nombre: "X", p_precio_extra: 0 })).rejects.toThrow(/Solo el dueño/);
  });
});

describe("PIN para reiniciar la demo", () => {
  const reiniciar = (pin?: string | null, actor = A.userId) => rpc<Reinicio>(db, actor, "reiniciar_demo", pin === undefined ? { p_nombre: "Mesas A" } : { p_nombre: "Mesas A", p_pin: pin });
  const conPin = async (actor = A.userId) => (await rpc<{ restaurante: { reinicio_con_pin: boolean } }>(db, actor, "obtener_contexto")).restaurante.reinicio_con_pin;
  const pedidosDe = async (rest: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.pedidos where restaurante_id = $1`, [rest])).rows[0].n;

  it("sin PIN definido se reinicia como siempre", async () => {
    expect(await conPin()).toBe(false);
    expect(await reiniciar()).toEqual({ ok: true });
  });

  it("ningún usuario de la app puede ponerlo, cambiarlo ni leerlo: solo quien administra la base", async () => {
    await expect(rpc(db, A.userId, "fn_definir_pin_reinicio", { p_pin: "1234" })).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "fn_definir_pin_reinicio", { p_pin: "1234" })).rejects.toThrow(/permission denied/);
    await expect(como(db, A.userId, `select * from public.pines_reinicio`)).rejects.toThrow(/permission denied/);
    await expect(como(db, null, `select * from public.pines_reinicio`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`select public.fn_definir_pin_reinicio('12')`)).rejects.toThrow(/entre 4 y 8 dígitos/);
    await expect(db.query(`select public.fn_definir_pin_reinicio('12ab')`)).rejects.toThrow(/entre 4 y 8 dígitos/);
  });

  it("con PIN: sin él o con uno equivocado no se reinicia nada; con el correcto sí", async () => {
    await db.query(`select public.fn_definir_pin_reinicio('4821', $1)`, [A.restauranteId]);
    expect(await conPin()).toBe(true);
    expect(await conPin(B.userId)).toBe(false); // el PIN es de cada demo
    const guardado = await db.query<{ hash: string }>(`select hash from public.pines_reinicio where restaurante_id = $1`, [A.restauranteId]);
    expect(guardado.rows[0].hash).not.toContain("4821"); // nunca en claro

    await rpc(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: (await menu()).productos[0].id }] });
    const antes = await pedidosDe(A.restauranteId);

    expect(await reiniciar()).toEqual({ ok: false, motivo: "pin", intentos_restantes: 4 });
    expect(await reiniciar("0000")).toEqual({ ok: false, motivo: "pin", intentos_restantes: 3 });
    expect(await pedidosDe(A.restauranteId)).toBe(antes); // sigue todo como estaba

    expect(await reiniciar(" 4821 ")).toEqual({ ok: true });
    expect(await pedidosDe(A.restauranteId)).toBe(antes - 1); // volvió a los datos de ejemplo
    expect(await conPin()).toBe(true); // reiniciar no quita el PIN
  });

  it("cinco intentos fallidos bloquean el reinicio un rato, incluso con el PIN correcto; después vuelve a servir", async () => {
    for (const quedan of [4, 3, 2, 1]) expect(await reiniciar("1111")).toEqual({ ok: false, motivo: "pin", intentos_restantes: quedan });
    expect(await reiniciar("1111")).toEqual({ ok: false, motivo: "bloqueado", minutos: 5 });
    expect(await reiniciar("4821")).toMatchObject({ ok: false, motivo: "bloqueado" });

    await db.query(`update public.pines_reinicio set bloqueado_hasta = now() - interval '1 second' where restaurante_id = $1`, [A.restauranteId]);
    expect(await reiniciar("4821")).toEqual({ ok: true });
    // Un acierto borra los fallos anteriores.
    expect(await reiniciar("0000")).toEqual({ ok: false, motivo: "pin", intentos_restantes: 4 });
    expect(await reiniciar("4821")).toEqual({ ok: true });
  });

  it("el ayudante sigue sin poder reiniciar, y quitar el PIN lo deja como antes", async () => {
    // Reiniciar saca al equipo de la visita anterior (migración 20): el ayudante vuelve a entrar para la prueba.
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante') on conflict do nothing`, [ayudante, A.restauranteId]);
    await expect(reiniciar("4821", ayudante)).rejects.toThrow(/Solo el dueño/);
    await db.query(`select public.fn_definir_pin_reinicio(null)`);
    expect(await conPin()).toBe(false);
    expect(await reiniciar()).toEqual({ ok: true });
  });

  it("sin decir a cuál, el PIN se pone en todas las demos (y solo en las demos)", async () => {
    const real = await db.query<{ id: string }>(`insert into public.restaurantes (nombre, es_demo) values ('Local De Verdad', false) returning id`);
    const n = await db.query<{ n: number }>(`select public.fn_definir_pin_reinicio('777777') as n`);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(2);
    expect(await conPin()).toBe(true);
    expect(await conPin(B.userId)).toBe(true);
    const fila = await db.query(`select 1 from public.pines_reinicio where restaurante_id = $1`, [real.rows[0].id]);
    expect(fila.rows).toHaveLength(0);
    await db.query(`select public.fn_definir_pin_reinicio(null)`);
  });
});
