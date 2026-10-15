/**
 * Migración 24, sobre Postgres real (PGlite): el pulso que las pantallas en vivo preguntan cada pocos segundos. La
 * huella debe cambiar con TODO lo que se ve en Pendientes, la plancha, por confirmar y los cobrados de hoy, y no
 * cambiar si nada pasó (si no, las pantallas lo volverían a pedir todo sin razón). Y cada local ve solo lo suyo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { momentoBogota, type Horario } from "@/lib/horario";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Rest = { userId: string; restauranteId: string };
type Creado = { id: string; numero: number; total: number };
type Resumen = { activo: boolean; atiende: boolean; cantidad: number; recientes: { id: string }[] };
type Pulso = { huella: string; por_confirmar: Resumen | null };

let db: PGlite;
let A: Rest;
let B: Rest;
let cocinaA: string;

const huella = (actor = A.userId) => rpc<string>(db, actor, "huella_pedidos");
const pulso = (actor = A.userId) => rpc<Pulso>(db, actor, "pulso");
const producto = async (nombre: string, actor = A.userId) =>
  (await rpc<{ productos: { id: string; nombre: string }[] }>(db, actor, "obtener_menu_para_pedido")).productos.find((p) => p.nombre === nombre)!.id;
const pedir = async (actor = A.userId) =>
  rpc<Creado>(db, actor, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: await producto("Hamburguesa sencilla", actor) }] });
const primerPlato = async (pedidoId: string) =>
  (await db.query<{ id: string }>(`select id from public.pedido_items where pedido_id = $1 and not anulado order by created_at, seq limit 1`, [pedidoId])).rows[0].id;

/** Lo que hace `paso`, ¿cambia la huella de A? */
async function cambia(paso: () => Promise<unknown>) {
  const antes = await huella();
  await paso();
  return (await huella()) !== antes;
}

async function slugDe(restauranteId: string) {
  return (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [restauranteId])).rows[0].slug;
}

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Pulso A");
  B = await crearRestauranteDemo(db, "Pulso B");
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('cocina-pulso@ejemplo.test') returning id`);
  cocinaA = u.rows[0].id;
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Cocina')`, [cocinaA, A.restauranteId]);
  const roles = (await rpc<{ roles: { id: string; nombre: string }[] }>(db, A.userId, "listar_equipo")).roles;
  await rpc(db, A.userId, "asignar_roles", { p_user_id: cocinaA, p_roles: [roles.find((r) => r.nombre === "Cocina")!.id] });
});
afterAll(() => db.close());

describe("la huella de los pedidos", () => {
  it("si nada pasa, no cambia (y es corta)", async () => {
    const h = await huella();
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(await huella()).toBe(h);
    expect((await pulso()).huella).toBe(h);
  });

  it("cambia con cada cosa que se ve en Pendientes y en la plancha", async () => {
    let p!: Creado;
    expect(await cambia(async () => (p = await pedir()))).toBe(true);
    const plato = await primerPlato(p.id);
    expect(await cambia(() => rpc(db, A.userId, "marcar_item_listo", { p_item_id: plato, p_listo: true }))).toBe(true);
    expect(await cambia(() => rpc(db, A.userId, "marcar_item_listo", { p_item_id: plato, p_listo: false }))).toBe(true);
    const papas = await producto("Gaseosa personal");
    expect(await cambia(() => rpc(db, A.userId, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [{ producto_id: papas }] }))).toBe(true);
    const agregado = (await db.query<{ id: string }>(`select id from public.pedido_items where pedido_id = $1 order by created_at desc, seq desc limit 1`, [p.id])).rows[0].id;
    expect(await cambia(() => rpc(db, A.userId, "anular_item_pedido", { p_item_id: agregado, p_motivo: "Se equivocó de bebida" }))).toBe(true);
    expect(await cambia(() => rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "listo" }))).toBe(true);
    expect(await cambia(() => rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" }))).toBe(true);
    // Cobrado y entregado sale de Pendientes pero queda en los cobrados de hoy: el cobro también se nota.
    const total = (await db.query<{ total: number }>(`select total from public.pedidos where id = $1`, [p.id])).rows[0].total;
    expect(await cambia(() => rpc(db, A.userId, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: total, recibido: total }] }))).toBe(true);
  });

  it("anular un pedido lo saca y se nota", async () => {
    const p = await pedir();
    expect(await cambia(() => rpc(db, A.userId, "anular_pedido", { p_pedido_id: p.id, p_motivo: "El cliente se fue" }))).toBe(true);
  });

  it("un pedido en línea que llega, se acepta o se cancela, también", async () => {
    const slug = await slugDe(A.restauranteId);
    const menu = await rpc<{ productos: { id: string }[] }>(db, null, "publico_menu", { p_slug: slug });
    let token = "";
    expect(
      await cambia(async () => {
        const r = await rpc<{ token: string }>(db, null, "publico_crear_pedido", {
          p_slug: slug, p_tipo: "llevar", p_nombre: "Marta Pérez", p_telefono: "3101234567", p_direccion: null, p_notas: null,
          p_items: [{ producto_id: menu.productos[0].id, cantidad: 1 }],
        });
        token = r.token;
      })
    ).toBe(true);
    const id = (await db.query<{ id: string }>(`select id from public.pedidos where token_seguimiento = $1`, [token])).rows[0].id;
    expect(await cambia(() => rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 20 }))).toBe(true);
  });

  it("lo que pasa en otro local no la mueve, y la de cada local es distinta", async () => {
    expect(await cambia(() => pedir(B.userId))).toBe(false);
    expect(await huella(B.userId)).not.toBe(await huella());
  });

  it("la plancha trae la huella con que se armó: la misma del pulso", async () => {
    const plancha = await rpc<{ huella: string }>(db, cocinaA, "listar_plancha");
    expect(plancha.huella).toBe((await pulso(cocinaA)).huella);
    expect(plancha.huella).toBe(await huella());
  });

  it("nadie sin cuenta la puede pedir", async () => {
    await expect(rpc(db, null, "pulso")).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "huella_pedidos")).rejects.toThrow(/permission denied/);
  });
});

describe("el resumen del aviso dentro del pulso", () => {
  it("solo le llega a quien toma pedidos", async () => {
    expect((await pulso()).por_confirmar).toMatchObject({ activo: expect.any(Boolean), cantidad: expect.any(Number) });
    expect((await pulso(cocinaA)).por_confirmar).toBeNull();
  });

  it("`atiende`: en línea y dentro del horario; fuera del horario o apagado, no", async () => {
    const resumen = async () => (await pulso()).por_confirmar!;
    await rpc(db, A.userId, "configurar_pedidos_en_linea", { p_activo: true });
    await rpc(db, A.userId, "configurar_horario", { p_horario: null });
    expect(await resumen()).toMatchObject({ activo: true, atiende: true });

    const { dia } = momentoBogota(new Date());
    const cerrado: Horario = [null, null, null, null, null, null, null];
    cerrado[(dia + 3) % 7] = { abre: "10:00", cierra: "11:00" };
    await rpc(db, A.userId, "configurar_horario", { p_horario: cerrado });
    expect(await resumen()).toMatchObject({ activo: true, atiende: false });

    await rpc(db, A.userId, "configurar_horario", { p_horario: null });
    await rpc(db, A.userId, "configurar_pedidos_en_linea", { p_activo: false });
    expect(await resumen()).toMatchObject({ activo: false, atiende: false });
    await rpc(db, A.userId, "configurar_pedidos_en_linea", { p_activo: true });
  });
});
