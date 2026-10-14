/**
 * Migración 19, sobre Postgres real (PGlite): cada local arma sus roles con las áreas que quiera, una persona puede
 * tener varios (ve la suma), y el candado está en la base: las escrituras sin el área fallan y las tablas de plata no
 * se leen sin el área, ni siquiera hablándole directo a la base.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { AREAS } from "@/lib/areas";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Equipo = {
  areas: string[];
  roles: { id: string; nombre: string; areas: string[]; personas: number }[];
  personas: { user_id: string; nombre: string; rol: string; yo: boolean; roles: string[]; areas: string[] }[];
};
type Contexto = { perfil: { rol: string; areas: string[]; roles: string[] } | null };
type Menu = { productos: { id: string; nombre: string; disponible: boolean }[] };
type Creado = { id: string; total: number };
type Inicio = Record<string, number | boolean | string | null>;

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };
/** Ids de los roles de A, por nombre. */
let rolesA: Record<string, string>;
let meseroB: string;
const gente = { mesero: "", cocina: "", meseroYCaja: "", sinRoles: "", extra: "" };

async function persona(restauranteId: string, nombre: string): Promise<string> {
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`${nombre.toLowerCase().replace(/\W+/g, "-")}@ejemplo.test`]);
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', $3)`, [u.rows[0].id, restauranteId, nombre]);
  return u.rows[0].id;
}
const equipo = (actor = A.userId) => rpc<Equipo>(db, actor, "listar_equipo");
const asignar = (userId: string, roles: string[], actor = A.userId) => rpc<{ areas: string[] }>(db, actor, "asignar_roles", { p_user_id: userId, p_roles: roles });
const guardarRol = (args: Record<string, unknown>, actor = A.userId) =>
  rpc<{ id: string; recuperado?: boolean }>(db, actor, "guardar_rol_equipo", { p_id: null, p_activo: true, ...args });
const perfil = async (actor: string) => (await rpc<Contexto>(db, actor, "obtener_contexto")).perfil;
/** La hamburguesa del menú del local de `actor` (el menú lo lee todo el equipo). */
const hamburguesa = async (actor = A.userId) =>
  (await rpc<Menu>(db, actor, "obtener_menu_para_pedido")).productos.find((p) => p.nombre === "Hamburguesa sencilla")!.id;
const pedir = async (actor: string) =>
  rpc<Creado>(db, actor, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: await hamburguesa(actor) }] });
const cobrar = (actor: string, p: Creado) =>
  rpc(db, actor, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: p.total, recibido: p.total }] });
const primerPlato = async (pedidoId: string) =>
  (await db.query<{ id: string }>(`select id from public.pedido_items where pedido_id = $1 and not anulado order by created_at, seq limit 1`, [pedidoId])).rows[0].id;
/** Cuántas filas de cada tabla de plata ve `actor` leyendo directo (como lo haría alguien con la llave pública). */
const filasVisibles = async (actor: string) =>
  (
    await como<Record<string, number>>(
      db,
      actor,
      `select (select count(*) from public.pagos_pedido)::int as pagos, (select count(*) from public.movimientos_fiado)::int as fiado,
              (select count(*) from public.clientes)::int as clientes, (select count(*) from public.gastos)::int as gastos,
              (select count(*) from public.cierres_dia)::int as cierres, (select count(*) from public.pedidos)::int as pedidos`
    )
  )[0];

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Permisos A");
  B = await crearRestauranteDemo(db, "Permisos B");
  rolesA = Object.fromEntries((await equipo()).roles.map((r) => [r.nombre, r.id]));

  gente.mesero = await persona(A.restauranteId, "Mesero A");
  gente.cocina = await persona(A.restauranteId, "Cocina A");
  gente.meseroYCaja = await persona(A.restauranteId, "Mesero y caja A");
  gente.sinRoles = await persona(A.restauranteId, "Sin roles A");
  gente.extra = await persona(A.restauranteId, "Extra A");
  await asignar(gente.mesero, [rolesA.Mesero]);
  await asignar(gente.cocina, [rolesA.Cocina]);
  await asignar(gente.meseroYCaja, [rolesA.Mesero, rolesA.Caja]);

  meseroB = await persona(B.restauranteId, "Mesero B");
  const rolesB = (await equipo(B.userId)).roles;
  await asignar(meseroB, [rolesB.find((r) => r.nombre === "Mesero")!.id], B.userId);
});
afterAll(() => db.close());

describe("roles del local", () => {
  it("cada restaurante arranca con Mesero, Cocina y Caja; las áreas son las mismas que conoce la app", async () => {
    const a = await equipo();
    expect(a.areas).toEqual([...AREAS]);
    expect(a.roles.map((r) => [r.nombre, r.areas])).toEqual([
      ["Mesero", ["pedidos"]],
      ["Cocina", ["plancha"]],
      ["Caja", ["caja", "fiado"]],
    ]);
    const b = await equipo(B.userId);
    expect(b.roles.map((r) => r.nombre)).toEqual(["Mesero", "Cocina", "Caja"]);
    expect(b.roles.some((r) => Object.values(rolesA).includes(r.id))).toBe(false); // son de cada local
  });

  it("el dueño lo abre todo aunque no tenga roles", async () => {
    expect(await perfil(A.userId)).toMatchObject({ rol: "dueno", areas: [...AREAS], roles: [] });
    expect((await equipo()).personas[0]).toMatchObject({ user_id: A.userId, rol: "dueno", yo: true });
  });

  it("una persona puede tener varios roles y ve la suma; sin roles no abre nada", async () => {
    expect(await perfil(gente.mesero)).toMatchObject({ rol: "ayudante", areas: ["pedidos"], roles: ["Mesero"] });
    expect(await perfil(gente.meseroYCaja)).toMatchObject({ areas: ["pedidos", "caja", "fiado"], roles: ["Mesero", "Caja"] });
    expect(await perfil(gente.sinRoles)).toMatchObject({ areas: [], roles: [] });

    const yo = (await equipo()).personas.find((p) => p.user_id === gente.meseroYCaja)!;
    expect(yo.roles).toEqual([rolesA.Mesero, rolesA.Caja]);
    expect(yo.areas).toEqual(["pedidos", "caja", "fiado"]);
    expect((await equipo()).roles.find((r) => r.nombre === "Mesero")?.personas).toBe(2);
  });
});

describe("el candado de las escrituras", () => {
  it("el mesero toma y entrega pedidos, pero no cobra, ni anota gastos, ni cierra el día, ni marca en la plancha", async () => {
    const p = await pedir(gente.mesero);
    await expect(cobrar(gente.mesero, p)).rejects.toThrow(/No tienes permiso para cobrar\. Pídeselo al dueño\./);
    await expect(rpc(db, gente.mesero, "registrar_gasto", { p_monto: 5000, p_categoria: "gas" })).rejects.toThrow(/permiso para registrar gastos/);
    await expect(rpc(db, gente.mesero, "registrar_cierre", { p_fecha: null, p_base_caja: 0, p_efectivo_contado: 0 })).rejects.toThrow(/permiso para ver las cuentas del día/);
    await expect(rpc(db, gente.mesero, "registrar_abono", { p_cliente_id: crypto.randomUUID(), p_monto: 1000, p_medio: "efectivo" })).rejects.toThrow(/permiso para manejar el fiado/);
    await expect(rpc(db, gente.mesero, "marcar_item_listo", { p_item_id: await primerPlato(p.id) })).rejects.toThrow(/permiso para manejar la plancha/);
    await expect(rpc(db, gente.mesero, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" })).resolves.toMatchObject({ estado: "entregado" });
    await expect(rpc(db, gente.mesero, "cambiar_disponibilidad", { p_producto_id: await hamburguesa(), p_disponible: true })).resolves.toBeTruthy();
    await expect(rpc(db, gente.sinRoles, "cambiar_disponibilidad", { p_producto_id: await hamburguesa(), p_disponible: true })).rejects.toThrow(/permiso/);
  });

  it("la cocina marca platos listos, pero no toma pedidos ni cobra", async () => {
    await expect(pedir(gente.cocina)).rejects.toThrow(/No tienes permiso para tomar pedidos/);
    const p = await pedir(A.userId);
    await expect(rpc(db, gente.cocina, "marcar_item_listo", { p_item_id: await primerPlato(p.id) })).resolves.toMatchObject({ estado: "listo" });
    await expect(rpc(db, gente.cocina, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "pendiente" })).resolves.toBeTruthy();
    await expect(cobrar(gente.cocina, p)).rejects.toThrow(/permiso para cobrar/);
  });

  it("mesero + caja: toma el pedido, lo cobra él mismo y puede deshacer el cobro", async () => {
    const p = await pedir(gente.meseroYCaja);
    await expect(cobrar(gente.meseroYCaja, p)).resolves.toMatchObject({ cobrado: p.total });
    await expect(rpc(db, gente.meseroYCaja, "anular_cobro", { p_pedido_id: p.id, p_motivo: "Se equivocó de medio" })).resolves.toBeTruthy();
  });

  it("anular un pedido sin cobrar es del mesero; si ya se cobró, hace falta la caja", async () => {
    const sinCobrar = await pedir(gente.mesero);
    await expect(rpc(db, gente.mesero, "anular_pedido", { p_pedido_id: sinCobrar.id, p_motivo: "El cliente se fue" })).resolves.toBeTruthy();

    const cobrado = await pedir(A.userId);
    await cobrar(A.userId, cobrado);
    await expect(rpc(db, gente.mesero, "anular_pedido", { p_pedido_id: cobrado.id, p_motivo: "Error" })).rejects.toThrow(/hace falta permiso de caja/);
    await expect(rpc(db, gente.meseroYCaja, "anular_pedido", { p_pedido_id: cobrado.id, p_motivo: "Error" })).resolves.toBeTruthy();
  });

  it("sin roles no se puede hacer nada", async () => {
    await expect(pedir(gente.sinRoles)).rejects.toThrow(/permiso para tomar pedidos/);
    await expect(rpc(db, gente.sinRoles, "registrar_gasto", { p_monto: 5000, p_categoria: "gas" })).rejects.toThrow(/permiso/);
  });

  it("lo que sube la cola sin conexión pasa por el mismo candado, y lo rechazado no queda como aplicado", async () => {
    const p = await pedir(gente.mesero);
    const clave = crypto.randomUUID();
    const operacion = { p_clave: clave, p_tipo: "cobrar", p_args: { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: p.total }] } };
    await expect(rpc(db, gente.mesero, "aplicar_operacion", operacion)).rejects.toThrow(/permiso para cobrar/);
    const aplicadas = await db.query<{ n: number }>(`select count(*)::int as n from public.operaciones_aplicadas where clave = $1`, [clave]);
    expect(aplicadas.rows[0].n).toBe(0);
    await expect(rpc(db, gente.meseroYCaja, "aplicar_operacion", { ...operacion, p_clave: crypto.randomUUID() })).resolves.toMatchObject({ cobrado: p.total });
  });
});

describe("lo que cada quien ve", () => {
  it("las tablas de plata no se leen sin el área, ni siquiera directo", async () => {
    const dueno = await filasVisibles(A.userId);
    expect(Object.values(dueno).every((n) => n > 0)).toBe(true);

    expect(await filasVisibles(gente.mesero)).toEqual({ pagos: 0, fiado: 0, clientes: 0, gastos: 0, cierres: 0, pedidos: dueno.pedidos });
    const caja = await filasVisibles(gente.meseroYCaja);
    expect(caja).toMatchObject({ pagos: dueno.pagos, fiado: dueno.fiado, clientes: dueno.clientes, gastos: 0, cierres: 0 });
    // Y nadie ve lo de otro restaurante, tenga el área que tenga.
    expect((await filasVisibles(meseroB)).pedidos).toBe((await filasVisibles(B.userId)).pedidos);
  });

  it("las lecturas no fallan: a cada quien le devuelven solo lo suyo", async () => {
    expect(await rpc(db, gente.mesero, "listar_gastos")).toMatchObject({ total: 0, gastos: [] });
    expect(await rpc(db, gente.mesero, "listar_clientes")).toEqual([]);
    expect(await rpc(db, gente.mesero, "listar_pedidos_cobrados_hoy")).toEqual([]);
    expect((await rpc<unknown[]>(db, gente.meseroYCaja, "listar_pedidos_cobrados_hoy")).length).toBeGreaterThan(0);
    expect((await rpc<unknown[]>(db, gente.meseroYCaja, "listar_clientes")).length).toBe(8);
    await expect(rpc(db, gente.mesero, "obtener_resumen_dia")).rejects.toThrow(/permiso para ver las cuentas del día/);
  });

  it("Inicio: los pendientes los ve todo el equipo; la plata, solo quien ve el cierre; el fiado, quien lo maneja", async () => {
    const dueno = await rpc<Inicio>(db, A.userId, "obtener_inicio");
    const mesero = await rpc<Inicio>(db, gente.mesero, "obtener_inicio");
    const caja = await rpc<Inicio>(db, gente.meseroYCaja, "obtener_inicio");

    expect(typeof dueno.ventas_hoy).toBe("number");
    expect(dueno.por_cobrar as number).toBeGreaterThan(0);
    for (const c of ["ventas_hoy", "gastos_hoy", "ganancia_hoy", "ventas_ayer", "gastos_ayer", "ganancia_ayer", "por_cobrar", "clientes_con_deuda"]) {
      expect(mesero[c]).toBeNull();
    }
    expect(mesero.pedidos_pendientes).toBe(dueno.pedidos_pendientes);
    expect(caja).toMatchObject({ ventas_hoy: null, por_cobrar: dueno.por_cobrar, clientes_con_deuda: dueno.clientes_con_deuda });
  });

  it("las fotos de los gastos: sin el área no se suben", async () => {
    const subir = (actor: string, nombre: string) => como(db, actor, `insert into storage.objects (bucket_id, name) values ('gastos-fotos', $1)`, [nombre]);
    await subir(A.userId, `${A.restauranteId}/factura.jpg`);
    await expect(subir(gente.mesero, `${A.restauranteId}/del-mesero.jpg`)).rejects.toThrow(/row-level security/);
    expect(await como(db, gente.mesero, `select name from storage.objects where bucket_id = 'gastos-fotos'`)).toEqual([]);
  });
});

describe("cada local decide", () => {
  it("si el dueño le abre la caja al Mesero, sus meseros cobran; en el otro local nada cambia", async () => {
    await guardarRol({ p_id: rolesA.Mesero, p_nombre: "Mesero", p_areas: ["caja", "pedidos", "caja"] });
    expect(await perfil(gente.mesero)).toMatchObject({ areas: ["pedidos", "caja"] }); // sin repetidos y en orden
    const p = await pedir(gente.mesero);
    await expect(cobrar(gente.mesero, p)).resolves.toMatchObject({ cobrado: p.total });

    await expect(cobrar(meseroB, await pedir(meseroB))).rejects.toThrow(/permiso para cobrar/);

    await guardarRol({ p_id: rolesA.Mesero, p_nombre: "Mesero", p_areas: ["pedidos"] });
    await expect(cobrar(gente.mesero, await pedir(gente.mesero))).rejects.toThrow(/permiso para cobrar/);
  });

  it("quitar un rol se lo quita a quienes lo tenían, y si vuelve, vuelve sin nadie", async () => {
    const { id } = await guardarRol({ p_nombre: "  Ayudante   de cocina ", p_areas: ["plancha", "pedidos"] });
    await asignar(gente.extra, [id]);
    expect(await perfil(gente.extra)).toMatchObject({ areas: ["pedidos", "plancha"], roles: ["Ayudante de cocina"] });

    await guardarRol({ p_id: id, p_nombre: "Ayudante de cocina", p_areas: ["plancha", "pedidos"], p_activo: false });
    expect(await perfil(gente.extra)).toMatchObject({ areas: [], roles: [] });
    expect((await equipo()).roles.some((r) => r.id === id)).toBe(false);

    await expect(guardarRol({ p_nombre: "ayudante de cocina", p_areas: ["plancha"] })).resolves.toEqual({ id, recuperado: true });
    expect(await perfil(gente.extra)).toMatchObject({ areas: [] });
  });

  it("valida nombre y áreas", async () => {
    await expect(guardarRol({ p_nombre: "Admin", p_areas: ["menu"] })).rejects.toThrow(/Ese permiso no existe/);
    await expect(guardarRol({ p_nombre: "   ", p_areas: ["caja"] })).rejects.toThrow(/nombre del rol/);
    await expect(guardarRol({ p_nombre: "MESERO", p_areas: ["caja"] })).rejects.toThrow(/Ya hay un rol con ese nombre/);
    await expect(guardarRol({ p_nombre: "Nada", p_areas: [] })).rejects.toThrow(/al menos una cosa/);
    await expect(guardarRol({ p_nombre: "Nada", p_areas: { caja: true } })).rejects.toThrow(/Elige qué puede hacer/);
  });

  it("solo el dueño arma el equipo, y solo con gente y roles de su local", async () => {
    await expect(equipo(gente.meseroYCaja)).rejects.toThrow(/Solo el dueño/);
    await expect(guardarRol({ p_nombre: "Jefe", p_areas: [...AREAS] }, gente.meseroYCaja)).rejects.toThrow(/Solo el dueño/);
    await expect(asignar(gente.meseroYCaja, [rolesA.Caja], gente.meseroYCaja)).rejects.toThrow(/Solo el dueño/);

    await expect(asignar(meseroB, [rolesA.Mesero])).rejects.toThrow(/no es de tu equipo/);
    const rolDeB = (await equipo(B.userId)).roles[0].id;
    await expect(asignar(gente.mesero, [rolDeB])).rejects.toThrow(/El rol no existe/);
    await expect(asignar(gente.mesero, ["no-es-un-id"])).rejects.toThrow(/El rol no existe/);
    expect(await perfil(gente.mesero)).toMatchObject({ areas: ["pedidos"] }); // lo rechazado no le cambió nada
  });
});

describe("ninguna escritura queda sin candado", () => {
  it("solo estas funciones piden apenas «ser del restaurante» (sin área)", async () => {
    const r = await db.query<{ nombre: string }>(
      `select distinct p.proname as nombre
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc like '%requerir_restaurante()%'
        order by 1`
    );
    // Las de avisos push son del celular de cada quien; aplicar_operacion llama a las de arriba, que piden su área.
    expect(r.rows.map((x) => x.nombre)).toEqual([
      "aplicar_operacion",
      "descartar_suscripciones_push",
      "estado_suscripcion_push",
      "guardar_suscripcion_push",
      "listar_destinos_push",
      "listar_destinos_push_pedido",
      "quitar_suscripcion_push",
      "requerir_area",
      "requerir_dueno",
    ]);
  });
});
