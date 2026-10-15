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

  it("primeros pasos: un local nuevo arranca en ceros y cada cosa que arma se cuenta", async () => {
    type Pasos = { platos: number; mesas: number; personas: number; invitaciones: number; pedidos: number; en_linea: boolean };
    const pasos = () => rpc<Pasos>(db, dueno, "primeros_pasos");
    expect(await pasos()).toEqual({ platos: 0, mesas: 0, personas: 0, invitaciones: 0, pedidos: 0, en_linea: false });

    const { id: categoria } = await rpc<{ id: string }>(db, dueno, "guardar_categoria", { p_id: null, p_nombre: "Asados", p_icono: "🍖", p_activa: true });
    const { id: plato } = await rpc<{ id: string }>(db, dueno, "guardar_producto", {
      p_id: null, p_categoria_id: categoria, p_nombre: "Pollo asado", p_precio: 28000, p_disponible: true, p_activo: true,
    });
    await rpc(db, dueno, "guardar_mesa", { p_id: null, p_nombre: "Mesa 1" });
    const roles = (await rpc<{ roles: { id: string }[] }>(db, dueno, "listar_equipo")).roles;
    await rpc(db, dueno, "crear_invitacion", { p_nombre: "Carlos", p_roles: [roles[0].id] });
    await rpc(db, dueno, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: plato }] });
    await rpc(db, dueno, "configurar_pedidos_en_linea", { p_activo: true });
    expect(await pasos()).toEqual({ platos: 1, mesas: 1, personas: 0, invitaciones: 1, pedidos: 1, en_linea: true });

    // Solo el dueño (es su guía).
    const u = await usuario("ayudante-pasos@ejemplo.test");
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, (select restaurante_id from public.perfiles where user_id = $2), 'ayudante', 'Ayudante')`, [u, dueno]);
    await expect(rpc(db, u, "primeros_pasos")).rejects.toThrow(/Solo el dueño/);
  });

  it("nadie lo puede llamar desde la app: solo desde el SQL Editor", async () => {
    await usuario("intruso@ejemplo.test");
    await expect(rpc(db, demo.userId, "fn_crear_restaurante", { p_correo: "intruso@ejemplo.test", p_nombre: "X", p_dueno: "Y" })).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "fn_crear_restaurante", { p_correo: "intruso@ejemplo.test", p_nombre: "X", p_dueno: "Y" })).rejects.toThrow(/permission denied/);
  });
});
