/**
 * Migración 22, sobre Postgres real (PGlite): un restaurante de verdad se da de alta desde el SQL Editor para un
 * usuario que ya existe; nace vacío y separado de la demo, y nadie lo puede crear desde la app.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Alta = { restaurante_id: string; nombre: string; dueno: string; enlace_clientes: string };

let db: PGlite;
let demo: { userId: string; restauranteId: string };
let dueno: string;

const usuario = async (correo: string) => (await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [correo])).rows[0].id;
const alta = async (correo: string, nombre: string, quien: string) =>
  (await db.query<{ r: Alta }>(`select public.fn_crear_restaurante($1, $2, $3) as r`, [correo, nombre, quien])).rows[0].r;

beforeAll(async () => {
  db = await crearBase();
  demo = await crearRestauranteDemo(db, "La Demo");
  dueno = await usuario("dona.marleny@ejemplo.test");
});
afterAll(() => db.close());

describe("dar de alta un restaurante de verdad", () => {
  it("con el correo de un usuario que ya existe: nace vacío, no es demo, con su enlace y los roles de siempre", async () => {
    const r = await alta("  Dona.Marleny@ejemplo.test ", "  Asadero   Doña Marleny ", "Marleny");
    expect(r).toMatchObject({ nombre: "Asadero Doña Marleny", dueno: "Marleny", enlace_clientes: "/pedir/asadero-dona-marleny" });

    const ctx = await rpc<{ restaurante: { nombre: string; es_demo: boolean; pedidos_en_linea: boolean }; perfil: { rol: string; areas: string[] } }>(db, dueno, "obtener_contexto");
    expect(ctx.restaurante).toMatchObject({ nombre: "Asadero Doña Marleny", es_demo: false, pedidos_en_linea: false });
    expect(ctx.perfil).toMatchObject({ rol: "dueno" });

    const menu = await rpc<{ categorias: unknown[]; productos: unknown[]; mesas: unknown[] }>(db, dueno, "obtener_menu_para_pedido");
    expect(menu).toMatchObject({ categorias: [], productos: [], mesas: [] });
    expect(await rpc(db, dueno, "listar_pedidos_pendientes")).toEqual([]);
    expect((await rpc<{ roles: { nombre: string }[] }>(db, dueno, "listar_equipo")).roles.map((x) => x.nombre)).toEqual(["Mesero", "Cocina", "Caja"]);
  });

  it("no se puede reiniciar (no es demo), y no ve nada de la demo ni la demo de él", async () => {
    await expect(rpc(db, dueno, "reiniciar_demo", { p_nombre: "Otro" })).rejects.toThrow(/Solo la demo se puede reiniciar/);
    expect((await rpc<unknown[]>(db, dueno, "listar_clientes")).length).toBe(0);
    const pendientesDemo = await rpc<unknown[]>(db, demo.userId, "listar_pedidos_pendientes");
    expect(pendientesDemo.length).toBeGreaterThan(0);
  });

  it("valida: el usuario debe existir y no tener ya restaurante; nombre y dueño obligatorios", async () => {
    await expect(alta("nadie@ejemplo.test", "X", "Y")).rejects.toThrow(/No existe el usuario nadie@ejemplo.test/);
    await expect(alta("dona.marleny@ejemplo.test", "Otro local", "Marleny")).rejects.toThrow(/ya tiene un restaurante/);
    await usuario("otro@ejemplo.test");
    await expect(alta("otro@ejemplo.test", "   ", "Pepe")).rejects.toThrow(/nombre del restaurante/);
    await expect(alta("otro@ejemplo.test", "Local", " ")).rejects.toThrow(/nombre del dueño/);
  });

  it("nadie lo puede llamar desde la app: solo desde el SQL Editor", async () => {
    await usuario("intruso@ejemplo.test");
    await expect(rpc(db, demo.userId, "fn_crear_restaurante", { p_correo: "intruso@ejemplo.test", p_nombre: "X", p_dueno: "Y" })).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "fn_crear_restaurante", { p_correo: "intruso@ejemplo.test", p_nombre: "X", p_dueno: "Y" })).rejects.toThrow(/permission denied/);
  });
});
