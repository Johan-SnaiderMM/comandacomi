/**
 * Migración 14, sobre Postgres real (PGlite): lo que no se cocina (bebidas) no pasa por la plancha ni frena el pedido,
 * y las reglas de quitar un plato. En la demo, la categoría Bebidas viene marcada "no se prepara".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Menu = {
  categorias: { id: string; nombre: string; se_prepara: boolean }[];
  productos: { id: string; categoria_id: string; nombre: string; precio: number }[];
  mesas: { id: string; pedido_abierto: string | null }[];
};
type Item = { id: string; nombre: string; listo: boolean; se_prepara?: boolean };
type Plancha = { pedidos: { id: string; estado: string; items: Item[] }[] };
type Creado = { id: string; numero: number; total: number; para_cocina: number };

let db: PGlite;
let U: string;
let rest: string;
let menu: Menu;

const plato = (nombre: string) => menu.productos.find((p) => p.nombre === nombre)!;
const linea = (nombre: string, cantidad = 1) => ({ producto_id: plato(nombre).id, cantidad });
const pedir = (items: unknown[]) => rpc<Creado>(db, U, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: items });
const estadoDe = async (id: string) => (await db.query<{ estado: string }>(`select estado from public.pedidos where id = $1`, [id])).rows[0].estado;
const enPlancha = async (id: string) => (await rpc<Plancha>(db, U, "listar_plancha")).pedidos.find((p) => p.id === id);
const enPendientes = async (id: string) => (await rpc<{ id: string; estado: string; items: Item[] }[]>(db, U, "listar_pedidos_pendientes")).find((p) => p.id === id);
const itemsDe = async (id: string) =>
  (await db.query<{ id: string; nombre: string; se_prepara: boolean }>(`select id, nombre, se_prepara from public.pedido_items where pedido_id = $1 and not anulado order by created_at, seq`, [id])).rows;

beforeAll(async () => {
  db = await crearBase();
  ({ userId: U, restauranteId: rest } = await crearRestauranteDemo(db, "Cocina"));
  menu = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("lo que no se cocina no pasa por la plancha", () => {
  it("en la demo, solo Bebidas viene marcada como «no se prepara»", () => {
    expect(menu.categorias.filter((c) => !c.se_prepara).map((c) => c.nombre)).toEqual(["Bebidas"]);
  });

  it("un pedido de solo bebidas nace listo y la plancha ni lo ve", async () => {
    const p = await pedir([linea("Gaseosa personal", 2), linea("Agua en botella")]);
    expect(p.para_cocina).toBe(0);
    expect(await estadoDe(p.id)).toBe("listo");
    expect(await enPlancha(p.id)).toBeUndefined();
    // En Pendientes sí está (hay que entregarlo y cobrarlo), con sus bebidas ya "listas".
    expect((await enPendientes(p.id))?.items.every((i) => i.listo && i.se_prepara === false)).toBe(true);
  });

  it("hamburguesa + gaseosa: la plancha ve solo la hamburguesa y con ella el pedido queda listo", async () => {
    const p = await pedir([linea("Hamburguesa sencilla"), linea("Gaseosa personal")]);
    expect(p.para_cocina).toBe(1);
    expect(await estadoDe(p.id)).toBe("pendiente");
    const tarjeta = await enPlancha(p.id);
    expect(tarjeta?.items.map((i) => i.nombre)).toEqual(["Hamburguesa sencilla"]);
    // La gaseosa todavía no figura lista: el pedido sigue en preparación.
    expect((await enPendientes(p.id))?.items.map((i) => [i.nombre, i.listo])).toEqual([["Hamburguesa sencilla", false], ["Gaseosa personal", false]]);

    const r = await rpc<{ estado: string; items_listos: number; items_total: number }>(db, U, "marcar_item_listo", { p_item_id: tarjeta!.items[0].id });
    expect(r).toMatchObject({ estado: "listo", items_listos: 1, items_total: 1 });
    expect((await enPendientes(p.id))?.items.every((i) => i.listo)).toBe(true);
  });

  it("agregar solo una bebida no devuelve el pedido a la cocina; agregar un plato sí", async () => {
    const p = await pedir([linea("Perro caliente")]);
    await rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "listo" });

    const bebida = await rpc<Creado>(db, U, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [linea("Jugo en agua")] });
    expect(bebida.para_cocina).toBe(0);
    expect(await estadoDe(p.id)).toBe("listo");

    const otro = await rpc<Creado>(db, U, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [linea("Arepa con todo")] });
    expect(otro.para_cocina).toBe(1);
    expect(await estadoDe(p.id)).toBe("pendiente");
    expect((await enPlancha(p.id))?.items.map((i) => [i.nombre, i.listo])).toEqual([["Perro caliente", true], ["Arepa con todo", false]]);
  });

  it("a un pedido ya entregado le agregan una bebida: queda listo (hay que entregarla), no pendiente", async () => {
    const p = await pedir([linea("Perro caliente")]);
    await rpc(db, U, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" });
    await rpc(db, U, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [linea("Limonada natural")] });
    expect(await estadoDe(p.id)).toBe("listo");
    expect(await enPlancha(p.id)).toBeDefined(); // "listos hace poco": el perro caliente sí se cocinó
  });

  it("lo mismo sin conexión: aplicar_operacion devuelve cuánto va a la cocina", async () => {
    const id = crypto.randomUUID();
    const r = await rpc<Creado>(db, U, "aplicar_operacion", {
      p_clave: crypto.randomUUID(),
      p_tipo: "crear_pedido",
      p_args: { p_id: id, p_tipo: "llevar", p_mesa_id: null, p_items: [linea("Agua en botella")] },
    });
    expect(r).toMatchObject({ id, para_cocina: 0 });
    expect(await estadoDe(id)).toBe("listo");
  });

  it("el pedido de un cliente con solo bebidas queda listo al aceptarlo, no antes", async () => {
    const slug = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [rest])).rows[0].slug;
    const c = await rpc<{ token: string }>(db, null, "publico_crear_pedido", {
      p_slug: slug, p_tipo: "llevar", p_nombre: "Marta Pérez", p_telefono: "3105550001", p_direccion: null, p_notas: null, p_items: [linea("Gaseosa 1,5 L")],
    });
    const id = (await db.query<{ id: string }>(`select id from public.pedidos where token_seguimiento = $1`, [c.token])).rows[0].id;
    const seguir = () => rpc<{ pedido: { etapa: string }; items: { listo: boolean }[] }>(db, null, "publico_ver_pedido", { p_token: c.token });
    expect((await seguir()).pedido.etapa).toBe("por_confirmar");
    expect((await seguir()).items[0].listo).toBe(false);

    const r = await rpc<{ para_cocina: number }>(db, U, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 5 });
    expect(r.para_cocina).toBe(0);
    expect((await seguir()).pedido.etapa).toBe("listo");
    expect((await seguir()).items[0].listo).toBe(true);
    expect(await enPlancha(id)).toBeUndefined();
  });

  it("el dato se copia al vender: cambiar la categoría después no toca los pedidos que ya están andando", async () => {
    const bebidas = menu.categorias.find((c) => c.nombre === "Bebidas")!;
    const antes = await pedir([linea("Hamburguesa sencilla"), linea("Gaseosa personal")]);

    await rpc(db, U, "guardar_categoria", { p_id: bebidas.id, p_nombre: "Bebidas", p_icono: "🍹", p_se_prepara: true });
    const despues = await pedir([linea("Gaseosa personal")]);
    expect(despues.para_cocina).toBe(1);
    expect(await estadoDe(despues.id)).toBe("pendiente");
    expect((await itemsDe(antes.id)).map((i) => i.se_prepara)).toEqual([true, false]);

    // Guardar la categoría sin decir nada de la cocina no cambia lo que ya tenía.
    await rpc(db, U, "guardar_categoria", { p_id: bebidas.id, p_nombre: "Bebidas", p_icono: "🍹", p_se_prepara: false });
    await rpc(db, U, "guardar_categoria", { p_id: bebidas.id, p_nombre: "Bebidas", p_icono: "🍹" });
    const admin = await rpc<{ categorias: { nombre: string; se_prepara: boolean }[] }>(db, U, "listar_menu_admin");
    expect(admin.categorias.find((c) => c.nombre === "Bebidas")?.se_prepara).toBe(false);
  });
});

describe("quitar un plato de un pedido", () => {
  it("recalcula el total y devuelve el pedido; el último plato no se quita", async () => {
    const p = await pedir([linea("Perro caliente", 2), linea("Arepa con todo")]);
    const [perros, arepa] = await itemsDe(p.id);
    const r = await rpc<{ pedido_id: string; numero: number; total: number }>(db, U, "anular_item_pedido", { p_item_id: arepa.id, p_motivo: "El cliente ya no lo quiso" });
    expect(r).toMatchObject({ pedido_id: p.id, numero: p.numero, total: 18000 });
    await expect(rpc(db, U, "anular_item_pedido", { p_item_id: perros.id, p_motivo: "Tampoco" })).rejects.toThrow(/único plato del pedido/);
    await expect(rpc(db, U, "anular_item_pedido", { p_item_id: perros.id, p_motivo: "  " })).rejects.toThrow(/motivo/);
    expect(await estadoDe(p.id)).toBe("pendiente");
  });

  it("si lo que queda no se cocina, el pedido pasa a listo", async () => {
    const p = await pedir([linea("Hamburguesa sencilla"), linea("Gaseosa personal")]);
    const [hamburguesa] = await itemsDe(p.id);
    await rpc(db, U, "anular_item_pedido", { p_item_id: hamburguesa.id, p_motivo: "Se acabó" });
    expect(await estadoDe(p.id)).toBe("listo");
    expect(await enPlancha(p.id)).toBeUndefined();
  });
});
