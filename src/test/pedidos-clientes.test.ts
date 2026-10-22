/**
 * Pedidos de clientes (sin cuenta), seguimiento por código y plancha, sobre Postgres real (PGlite).
 * Lo más importante que prueba: un visitante anónimo solo puede hacer lo que debe (ver el menú, enviar un pedido,
 * ver SU pedido) y nada más; y que un restaurante nunca toca los pedidos de otro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Rest = { userId: string; restauranteId: string };
type Menu = {
  productos: { id: string; categoria_id: string; nombre: string; precio: number; disponible: boolean }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  categorias: { id: string; nombre: string }[];
};
type Seguimiento = {
  ahora: string;
  restaurante: { nombre: string; slug: string };
  pedido: {
    numero: number;
    tipo: string;
    etapa: "por_confirmar" | "preparando" | "listo" | "entregado" | "cancelado";
    tiempo_estimado_min: number | null;
    total: number;
    motivo: string | null;
    direccion: string | null;
    contacto_nombre: string | null;
  };
  items: { nombre: string; cantidad: number; notas: string | null; adiciones: string[]; listo: boolean }[];
};
type Plancha = { ahora: string; pedidos: { id: string; numero: number; estado: string; items: { id: string; nombre: string; listo: boolean }[] }[] };

let db: PGlite;
let A: Rest;
let B: Rest;
let slugA: string;
let slugB: string;
let menuA: Menu;
let menuB: Menu;
let contador = 0;

/** Un celular colombiano distinto cada vez (el tope es por teléfono). */
const telefono = () => `310${String(1_000_000 + ++contador)}`;
const plato = (m: Menu, nombre: string) => m.productos.find((p) => p.nombre === nombre)!;

async function slugDe(restauranteId: string) {
  const r = await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [restauranteId]);
  return r.rows[0].slug;
}

const publico = <T = unknown>(fn: string, args: Record<string, unknown> = {}) => rpc<T>(db, null, fn, args);

/**
 * Envía un pedido como cliente anónimo. Para no chocar con el tope "por minuto" (que tiene su propia prueba) cada
 * pedido se envejece 10 minutos; con `reciente: true` se deja como llegó.
 */
async function pedirComoCliente(slug: string, items: unknown[], extra: Record<string, unknown> = {}, reciente = false) {
  const r = await publico<{ token: string; numero: number; total: number }>("publico_crear_pedido", {
    p_slug: slug,
    p_tipo: "llevar",
    p_nombre: "Marta Pérez",
    p_telefono: telefono(),
    p_direccion: null,
    p_notas: null,
    p_items: items,
    p_acepta_datos: true,
    ...extra,
  });
  if (!reciente) await db.query(`update public.pedidos set created_at = created_at - interval '10 minutes' where token_seguimiento = $1`, [r.token]);
  return r;
}

const unPerroCaliente = (m: Menu, cantidad = 1) => [{ producto_id: plato(m, "Perro caliente").id, cantidad }];

async function idDePedido(token: string) {
  const r = await db.query<{ id: string }>(`select id from public.pedidos where token_seguimiento = $1`, [token]);
  return r.rows[0].id;
}

const seguir = (token: string) => publico<Seguimiento | null>("publico_ver_pedido", { p_token: token });

async function ayudanteDe(restauranteId: string, correo: string) {
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [correo]);
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante')`, [u.rows[0].id, restauranteId]);
  return u.rows[0].id;
}

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Picnic Delicias");
  B = await crearRestauranteDemo(db, "Otro Local");
  slugA = await slugDe(A.restauranteId);
  slugB = await slugDe(B.restauranteId);
  menuA = await rpc<Menu>(db, A.userId, "obtener_menu_para_pedido");
  menuB = await rpc<Menu>(db, B.userId, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("slug del restaurante", () => {
  it("se arma con el nombre, sin tildes ni símbolos", async () => {
    expect(slugA).toBe("picnic-delicias");
    const r = await db.query<{ slug: string }>(`insert into public.restaurantes (nombre) values ('Café  Ñandú & Más!!') returning slug`);
    expect(r.rows[0].slug).toBe("cafe-nandu-mas");
  });

  it("si ya existe agrega un número, y las palabras reservadas no se usan", async () => {
    const igual = await db.query<{ slug: string }>(`insert into public.restaurantes (nombre) values ('Picnic Delicias') returning slug`);
    expect(igual.rows[0].slug).toBe("picnic-delicias-2");
    const reservada = await db.query<{ slug: string }>(`insert into public.restaurantes (nombre) values ('Admin') returning slug`);
    expect(reservada.rows[0].slug).toBe("admin-2");
    const corta = await db.query<{ slug: string }>(`insert into public.restaurantes (nombre) values ('A') returning slug`);
    expect(corta.rows[0].slug).toBe("a-local");
  });

  it("nadie puede guardar un slug con formato inválido", async () => {
    await expect(db.query(`insert into public.restaurantes (nombre, slug) values ('X', 'Con Espacios')`)).rejects.toThrow(/chk_restaurantes_slug/);
    await expect(db.query(`insert into public.restaurantes (nombre, slug) values ('X', 'dos--guiones')`)).rejects.toThrow(/chk_restaurantes_slug/);
  });

  it("reiniciar la demo con otro nombre cambia el enlace público y reabre los pedidos en línea", async () => {
    const C = await crearRestauranteDemo(db, "Local De Prueba");
    await rpc(db, C.userId, "configurar_pedidos_en_linea", { p_activo: false });
    await rpc(db, C.userId, "reiniciar_demo", { p_nombre: "Fladi" });
    const ctx = await rpc<{ restaurante: { slug: string; pedidos_en_linea: boolean; nombre: string } }>(db, C.userId, "obtener_contexto");
    expect(ctx.restaurante).toMatchObject({ slug: "fladi", nombre: "Fladi", pedidos_en_linea: true });
    expect(await publico("publico_menu", { p_slug: "fladi" })).not.toBeNull();
    // El enlace anterior sigue funcionando y dice cuál es el vigente (ver enlaces-y-quitados.test.ts).
    expect(await publico("publico_menu", { p_slug: "local-de-prueba" })).toMatchObject({ restaurante: { slug: "fladi" } });
  });
});

describe("permisos: lo anónimo se limita a publico_*", () => {
  it("anon ejecuta exactamente estas funciones publico_* y ninguna otra", async () => {
    const r = await db.query<{ nombre: string }>(
      `select p.proname as nombre from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
        order by 1`
    );
    expect(r.rows.map((x) => x.nombre)).toEqual(["publico_cancelar_pedido", "publico_crear_pedido", "publico_destinos_push", "publico_guardar_push_cliente", "publico_menu", "publico_ver_pedido"]);
  });

  it("sin sesión no se puede leer ninguna tabla ni usar funciones del personal", async () => {
    await expect(como(db, null, `select * from public.pedidos`)).rejects.toThrow(/permission denied/);
    await expect(como(db, null, `select * from public.restaurantes`)).rejects.toThrow(/permission denied/);
    await expect(publico("listar_pedidos_por_confirmar")).rejects.toThrow(/permission denied/);
    await expect(publico("listar_plancha")).rejects.toThrow(/permission denied/);
    await expect(publico("confirmar_pedido_cliente", { p_pedido_id: crypto.randomUUID() })).rejects.toThrow(/permission denied/);
    await expect(publico("marcar_item_listo", { p_item_id: crypto.randomUUID() })).rejects.toThrow(/permission denied/);
  });
});

describe("publico_menu", () => {
  it("devuelve lo que el cliente necesita y nada más", async () => {
    const m = await publico<Record<string, unknown> & { restaurante: Record<string, unknown>; productos: Record<string, unknown>[] }>("publico_menu", { p_slug: slugA });
    // `abierto` = se puede pedir ahora; `recibe` es el interruptor y `horario` el horario (la demo no tiene: null).
    expect(m.restaurante).toEqual({ nombre: "Picnic Delicias", slug: "picnic-delicias", es_demo: true, abierto: true, recibe: true, horario: null });
    expect(Object.keys(m).sort()).toEqual(["categorias", "modificadores", "productos", "restaurante"]);
    expect(m.productos).toHaveLength(25);
    expect(Object.keys(m.productos[0]).sort()).toEqual(["categoria_id", "descripcion", "disponible", "foto", "id", "nombre", "precio"]);
  });

  it("enlace que no existe devuelve null; mayúsculas y espacios se toleran", async () => {
    expect(await publico("publico_menu", { p_slug: "no-existe" })).toBeNull();
    expect(await publico("publico_menu", { p_slug: "  PICNIC-Delicias " })).not.toBeNull();
    expect(await publico("publico_menu", { p_slug: "" })).toBeNull();
  });

  it("no muestra platos archivados ni categorías ocultas, y marca lo agotado", async () => {
    const hamb = plato(menuB, "Hamburguesa sencilla");
    const perro = plato(menuB, "Perro caliente");
    await rpc(db, B.userId, "guardar_producto", { p_id: hamb.id, p_categoria_id: hamb.categoria_id, p_nombre: hamb.nombre, p_precio: hamb.precio, p_activo: false });
    await rpc(db, B.userId, "cambiar_disponibilidad", { p_producto_id: perro.id, p_disponible: false });
    const m = await publico<{ productos: { id: string; disponible: boolean }[] }>("publico_menu", { p_slug: slugB });
    expect(m.productos.find((p) => p.id === hamb.id)).toBeUndefined();
    expect(m.productos.find((p) => p.id === perro.id)?.disponible).toBe(false);

    const cat = menuB.categorias.find((c) => c.nombre === "Pollo")!;
    await rpc(db, B.userId, "guardar_categoria", { p_id: cat.id, p_nombre: "Pollo", p_icono: null, p_activa: false });
    const sinPollo = await publico<{ productos: { categoria_id: string }[]; categorias: { id: string }[] }>("publico_menu", { p_slug: slugB });
    expect(sinPollo.productos.some((p) => p.categoria_id === cat.id)).toBe(false);
    expect(sinPollo.categorias.some((c) => c.id === cat.id)).toBe(false);

    // se deja el menú de B como estaba para el resto de las pruebas
    await rpc(db, B.userId, "guardar_producto", { p_id: hamb.id, p_categoria_id: hamb.categoria_id, p_nombre: hamb.nombre, p_precio: hamb.precio, p_activo: true });
    await rpc(db, B.userId, "cambiar_disponibilidad", { p_producto_id: perro.id, p_disponible: true });
    await rpc(db, B.userId, "guardar_categoria", { p_id: cat.id, p_nombre: "Pollo", p_icono: null, p_activa: true });
  });
});

describe("pedir en línea", () => {
  it("recoger en el local: entra por confirmar, con precios de la base, y NO aparece en la cocina", async () => {
    const antes = await rpc<number>(db, A.userId, "contar_pendientes");
    const adicion = menuA.modificadores.find((m) => m.categoria_id === plato(menuA, "Hamburguesa sencilla").categoria_id)!;
    const r = await pedirComoCliente(
      slugA,
      [
        { producto_id: plato(menuA, "Hamburguesa sencilla").id, cantidad: 2, adiciones: [adicion.id], notas: "  sin cebolla " },
        { producto_id: plato(menuA, "Perro caliente").id, cantidad: 1 },
      ],
      { p_nombre: "  Marta Pérez  ", p_telefono: "300 123 4567", p_notas: "Paso en 10 minutos" }
    );
    const esperado = (plato(menuA, "Hamburguesa sencilla").precio + adicion.precio_extra) * 2 + plato(menuA, "Perro caliente").precio;
    expect(r.total).toBe(esperado);
    expect(r.token).toMatch(/^[0-9a-f-]{36}$/);

    // no está en Pendientes ni en la plancha, pero sí en "por confirmar"
    expect(await rpc<number>(db, A.userId, "contar_pendientes")).toBe(antes);
    const pend = await rpc<{ numero: number }[]>(db, A.userId, "listar_pedidos_pendientes");
    expect(pend.some((p) => p.numero === r.numero)).toBe(false);
    const plancha = await rpc<Plancha>(db, A.userId, "listar_plancha");
    expect(plancha.pedidos.some((p) => p.numero === r.numero)).toBe(false);

    const porConfirmar = await rpc<{ id: string; numero: number; tipo: string; contacto_nombre: string; contacto_telefono: string; direccion: string | null; notas: string; total: number; items: { nombre: string; cantidad: number; notas: string | null }[] }[]>(
      db, A.userId, "listar_pedidos_por_confirmar"
    );
    const mio = porConfirmar.find((p) => p.numero === r.numero)!;
    expect(mio).toMatchObject({ tipo: "llevar", contacto_nombre: "Marta Pérez", contacto_telefono: "+573001234567", direccion: null, notas: "Paso en 10 minutos", total: esperado });
    expect(mio.items.map((i) => [i.nombre, i.cantidad, i.notas])).toEqual([
      ["Hamburguesa sencilla", 2, "sin cebolla"],
      ["Perro caliente", 1, null],
    ]);

    const inicio = await rpc<{ pedidos_por_confirmar: number }>(db, A.userId, "obtener_inicio");
    expect(inicio.pedidos_por_confirmar).toBeGreaterThanOrEqual(1);
    const resumen = await rpc<{ activo: boolean; cantidad: number; recientes: { numero: number }[] }>(db, A.userId, "resumen_por_confirmar");
    expect(resumen.activo).toBe(true);
    expect(resumen.cantidad).toBe(inicio.pedidos_por_confirmar);
    expect(resumen.recientes.some((x) => x.numero === r.numero)).toBe(true);
  });

  it("domicilio: exige dirección y la guarda; para recoger la dirección se ignora", async () => {
    await expect(pedirComoCliente(slugA, unPerroCaliente(menuA), { p_tipo: "domicilio", p_direccion: "  " })).rejects.toThrow(/dirección/);
    const d = await pedirComoCliente(slugA, unPerroCaliente(menuA), { p_tipo: "domicilio", p_direccion: "  Cra 7 #8-9, barrio Centro " });
    const s = await seguir(d.token);
    expect(s?.pedido).toMatchObject({ tipo: "domicilio", direccion: "Cra 7 #8-9, barrio Centro", etapa: "por_confirmar" });

    const l = await pedirComoCliente(slugA, unPerroCaliente(menuA), { p_tipo: "llevar", p_direccion: "Calle falsa 123" });
    expect((await seguir(l.token))?.pedido.direccion).toBeNull();
  });

  it("rechaza lo que no corresponde, con mensajes que el cliente entiende", async () => {
    const ok = unPerroCaliente(menuA);
    await expect(pedirComoCliente("no-existe", ok)).rejects.toThrow(/no existe/);
    await expect(pedirComoCliente(slugA, ok, { p_tipo: "mesa" })).rejects.toThrow(/recogerlo/);
    await expect(pedirComoCliente(slugA, ok, { p_nombre: " " })).rejects.toThrow(/tu nombre/);
    await expect(pedirComoCliente(slugA, ok, { p_telefono: "12345" })).rejects.toThrow(/teléfono/);
    await expect(pedirComoCliente(slugA, [])).rejects.toThrow(/al menos un plato/);
    await expect(pedirComoCliente(slugA, unPerroCaliente(menuA, 21))).rejects.toThrow(/máxima por plato/);
    await expect(pedirComoCliente(slugA, Array.from({ length: 31 }, () => ok[0]))).rejects.toThrow(/máximo 30/);
    await expect(pedirComoCliente(slugA, [{ ...ok[0], adiciones: Array.from({ length: 9 }, () => crypto.randomUUID()) }])).rejects.toThrow(/adiciones/);
    await expect(pedirComoCliente(slugA, [{ producto_id: crypto.randomUUID(), cantidad: 1 }])).rejects.toThrow(/ya no existe/);
  });

  it("un plato de OTRO restaurante o una adición ajena no entran", async () => {
    await expect(pedirComoCliente(slugA, [{ producto_id: plato(menuB, "Perro caliente").id, cantidad: 1 }])).rejects.toThrow(/ya no existe/);
    const adicionDeB = menuB.modificadores[0].id;
    await expect(pedirComoCliente(slugA, [{ producto_id: plato(menuA, "Perro caliente").id, cantidad: 1, adiciones: [adicionDeB] }])).rejects.toThrow(/adición/);
  });

  it("un plato agotado no se puede pedir", async () => {
    const p = plato(menuA, "Gaseosa personal");
    await rpc(db, A.userId, "cambiar_disponibilidad", { p_producto_id: p.id, p_disponible: false });
    await expect(pedirComoCliente(slugA, [{ producto_id: p.id, cantidad: 1 }])).rejects.toThrow(/no está disponible/);
    await rpc(db, A.userId, "cambiar_disponibilidad", { p_producto_id: p.id, p_disponible: true });
  });

  it("si el restaurante cerró los pedidos en línea, el cliente lo ve y no puede pedir", async () => {
    await rpc(db, B.userId, "configurar_pedidos_en_linea", { p_activo: false });
    const m = await publico<{ restaurante: { abierto: boolean } }>("publico_menu", { p_slug: slugB });
    expect(m.restaurante.abierto).toBe(false);
    await expect(pedirComoCliente(slugB, unPerroCaliente(menuB))).rejects.toThrow(/no está recibiendo pedidos/);
    // el aviso del personal lo sabe (pregunta con calma mientras esté cerrado y sin pedidos)
    expect((await rpc<{ activo: boolean }>(db, B.userId, "resumen_por_confirmar")).activo).toBe(false);
    await rpc(db, B.userId, "configurar_pedidos_en_linea", { p_activo: true });
    expect((await rpc<{ activo: boolean }>(db, B.userId, "resumen_por_confirmar")).activo).toBe(true);
    await expect(pedirComoCliente(slugB, unPerroCaliente(menuB))).resolves.toBeTruthy();
  });

  it("solo el dueño abre o cierra los pedidos en línea", async () => {
    const ayudante = await ayudanteDe(B.restauranteId, "ayudante-b@ejemplo.test");
    await expect(rpc(db, ayudante, "configurar_pedidos_en_linea", { p_activo: false })).rejects.toThrow(/Solo el dueño/);
  });

  it("tope por teléfono: el cuarto pedido seguido se rechaza", async () => {
    const tel = "3207771111";
    for (let i = 0; i < 3; i++) await pedirComoCliente(slugA, unPerroCaliente(menuA), { p_telefono: tel });
    await expect(pedirComoCliente(slugA, unPerroCaliente(menuA), { p_telefono: tel })).rejects.toThrow(/varios pedidos hace poco/);
    // con otro teléfono sí
    await expect(pedirComoCliente(slugA, unPerroCaliente(menuA))).resolves.toBeTruthy();
  });

  it("tope por minuto: no se llena el local de pedidos de golpe", async () => {
    const C = await crearRestauranteDemo(db, "Tope Por Minuto");
    const slug = await slugDe(C.restauranteId);
    const menu = await rpc<Menu>(db, C.userId, "obtener_menu_para_pedido");
    for (let i = 0; i < 10; i++) await pedirComoCliente(slug, unPerroCaliente(menu), {}, true);
    await expect(pedirComoCliente(slug, unPerroCaliente(menu), {}, true)).rejects.toThrow(/muchos pedidos a la vez/);
  });

  it("tope de pedidos por confirmar: con 25 sin atender no entran más", async () => {
    const C = await crearRestauranteDemo(db, "Tope Sin Atender");
    const slug = await slugDe(C.restauranteId);
    const menu = await rpc<Menu>(db, C.userId, "obtener_menu_para_pedido");
    for (let tanda = 0; tanda < 3; tanda++) {
      const cuantos = tanda < 2 ? 10 : 5;
      for (let i = 0; i < cuantos; i++) await pedirComoCliente(slug, unPerroCaliente(menu));
      // se envejecen para no chocar con el tope por minuto
      await db.query(`update public.pedidos set created_at = now() - interval '5 minutes' where restaurante_id = $1 and origen = 'cliente'`, [C.restauranteId]);
    }
    await expect(pedirComoCliente(slug, unPerroCaliente(menu))).rejects.toThrow(/muchos pedidos por confirmar/);
    // atender uno libera un cupo
    const lista = await rpc<{ id: string }[]>(db, C.userId, "listar_pedidos_por_confirmar");
    expect(lista).toHaveLength(25);
    await rpc(db, C.userId, "confirmar_pedido_cliente", { p_pedido_id: lista[0].id, p_minutos: 10 });
    await expect(pedirComoCliente(slug, unPerroCaliente(menu))).resolves.toBeTruthy();
  });
});

describe("aceptar, rechazar y cancelar", () => {
  it("antes de aceptar el pedido está congelado: no se mueve, no se cobra, no se marca", async () => {
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    const id = await idDePedido(r.token);
    await expect(rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: id, p_estado: "listo" })).rejects.toThrow(/Primero acepta/);
    await expect(
      rpc(db, A.userId, "cobrar_pedido", { p_pedido_id: id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: r.total }] })
    ).rejects.toThrow(/Primero acepta/);
    const item = (await db.query<{ id: string }>(`select id from public.pedido_items where pedido_id = $1`, [id])).rows[0].id;
    await expect(rpc(db, A.userId, "marcar_item_listo", { p_item_id: item })).rejects.toThrow(/Primero acepta/);
  });

  it("aceptar con tiempo estimado lo pasa a la cocina y el cliente lo ve", async () => {
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA, 2));
    const id = await idDePedido(r.token);
    expect((await seguir(r.token))?.pedido.etapa).toBe("por_confirmar");

    await expect(rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 0 })).rejects.toThrow(/entre 1 y 240/);
    await expect(rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 241 })).rejects.toThrow(/entre 1 y 240/);
    await rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 15 });

    const s = await seguir(r.token);
    expect(s?.pedido).toMatchObject({ etapa: "preparando", tiempo_estimado_min: 15 });
    expect(s?.items).toEqual([{ nombre: "Perro caliente", cantidad: 2, notas: null, adiciones: [], listo: false }]);

    const pend = await rpc<{ id: string; origen: string; token: string; tiempo_estimado_min: number }[]>(db, A.userId, "listar_pedidos_pendientes");
    expect(pend.find((p) => p.id === id)).toMatchObject({ origen: "cliente", token: r.token, tiempo_estimado_min: 15 });
    const plancha = await rpc<Plancha>(db, A.userId, "listar_plancha");
    expect(plancha.pedidos.some((p) => p.id === id)).toBe(true);
    const por = await rpc<{ id: string }[]>(db, A.userId, "listar_pedidos_por_confirmar");
    expect(por.some((p) => p.id === id)).toBe(false);

    // aceptar dos veces no rompe nada
    const otra = await rpc<{ ya_aceptado?: boolean }>(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 30 });
    expect(otra.ya_aceptado).toBe(true);
    expect((await seguir(r.token))?.pedido.tiempo_estimado_min).toBe(15);
  });

  it("rechazar con motivo: el cliente lo ve; después de aceptado el motivo interno no se muestra", async () => {
    const r1 = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    await rpc(db, A.userId, "anular_pedido", { p_pedido_id: await idDePedido(r1.token), p_motivo: "Sin ingredientes" });
    const s1 = await seguir(r1.token);
    expect(s1?.pedido).toMatchObject({ etapa: "cancelado", motivo: "Sin ingredientes" });
    const por = await rpc<{ numero: number }[]>(db, A.userId, "listar_pedidos_por_confirmar");
    expect(por.some((p) => p.numero === r1.numero)).toBe(false);

    const r2 = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    const id2 = await idDePedido(r2.token);
    await rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id2, p_minutos: 10 });
    await rpc(db, A.userId, "anular_pedido", { p_pedido_id: id2, p_motivo: "Error nuestro, cliente grosero" });
    const s2 = await seguir(r2.token);
    expect(s2?.pedido.etapa).toBe("cancelado");
    expect(s2?.pedido.motivo).toBeNull();
  });

  it("el cliente puede cancelar solo mientras no lo aceptan", async () => {
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    await publico("publico_cancelar_pedido", { p_token: r.token });
    const s = await seguir(r.token);
    expect(s?.pedido).toMatchObject({ etapa: "cancelado", motivo: "Cancelado por el cliente" });
    await expect(publico("publico_cancelar_pedido", { p_token: r.token })).resolves.toEqual({ ok: true }); // repetir no falla

    const aceptado = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    await rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: await idDePedido(aceptado.token), p_minutos: 10 });
    await expect(publico("publico_cancelar_pedido", { p_token: aceptado.token })).rejects.toThrow(/ya aceptó/);
    expect((await seguir(aceptado.token))?.pedido.etapa).toBe("preparando");

    await expect(publico("publico_cancelar_pedido", { p_token: crypto.randomUUID() })).rejects.toThrow(/No encontramos/);
  });

  it("un restaurante no puede aceptar, ver ni marcar los pedidos de otro", async () => {
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    const id = await idDePedido(r.token);
    await expect(rpc(db, B.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 10 })).rejects.toThrow(/no existe/);
    await expect(rpc(db, B.userId, "anular_pedido", { p_pedido_id: id, p_motivo: "Intento ajeno" })).rejects.toThrow(/no existe/);
    const deB = await rpc<{ id: string }[]>(db, B.userId, "listar_pedidos_por_confirmar");
    expect(deB.some((p) => p.id === id)).toBe(false);
    const resumenB = await rpc<{ recientes: { id: string }[] }>(db, B.userId, "resumen_por_confirmar");
    expect(resumenB.recientes.some((p) => p.id === id)).toBe(false);
    // y sigue intacto
    expect((await seguir(r.token))?.pedido.etapa).toBe("por_confirmar");
  });
});

describe("seguimiento: solo el pedido del código", () => {
  it("un código inventado no devuelve nada y la respuesta no trae datos internos", async () => {
    expect(await seguir(crypto.randomUUID())).toBeNull();
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    const s = await seguir(r.token);
    const texto = JSON.stringify(s);
    for (const prohibido of ["restaurante_id", "token", "registrado_por", "contacto_telefono", "confirmado_por", "perfil"]) {
      expect(texto, `la respuesta no debe incluir ${prohibido}`).not.toContain(prohibido);
    }
    expect(s?.restaurante).toEqual({ nombre: "Picnic Delicias", slug: "picnic-delicias" });
  });

  it("también sirve para pedidos que tomó el personal (por ejemplo, un domicilio por teléfono)", async () => {
    const m = await rpc<{ id: string }>(db, A.userId, "crear_pedido", {
      p_tipo: "domicilio",
      p_mesa_id: null,
      p_items: unPerroCaliente(menuA),
      p_contacto_nombre: "Don Jairo",
      p_direccion: "Calle 9 #12-40",
    });
    const token = (await db.query<{ t: string }>(`select token_seguimiento as t from public.pedidos where id = $1`, [m.id])).rows[0].t;
    const s = await seguir(token);
    expect(s?.pedido).toMatchObject({ tipo: "domicilio", etapa: "preparando", origen: "mostrador" });
  });
});

describe("plancha: plato por plato", () => {
  async function pedidoAceptado(items: unknown[]) {
    const r = await pedirComoCliente(slugA, items);
    const id = await idDePedido(r.token);
    await rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 20 });
    const itemIds = (await db.query<{ id: string }>(`select id from public.pedido_items where pedido_id = $1 order by created_at, seq`, [id])).rows.map((x) => x.id);
    return { ...r, id, itemIds };
  }
  const estadoDe = async (id: string) => (await db.query<{ estado: string; listo: boolean }>(`select estado, listo_at is not null as listo from public.pedidos where id = $1`, [id])).rows[0];

  it("marcar los platos de a uno: el pedido pasa a listo solo con el último", async () => {
    const p = await pedidoAceptado([
      { producto_id: plato(menuA, "Salchipapa sencilla").id, cantidad: 1 },
      { producto_id: plato(menuA, "Perro caliente").id, cantidad: 2 },
      { producto_id: plato(menuA, "Arepa con todo").id, cantidad: 1 },
    ]);
    const a = await rpc<{ estado: string; items_listos: number; items_total: number }>(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    expect(a).toMatchObject({ estado: "pendiente", items_listos: 1, items_total: 3 });
    let s = await seguir(p.token);
    expect(s?.items.map((i) => i.listo)).toEqual([true, false, false]);
    expect(s?.pedido.etapa).toBe("preparando");

    await rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[1] });
    const c = await rpc<{ estado: string; items_listos: number }>(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[2] });
    expect(c).toMatchObject({ estado: "listo", items_listos: 3 });
    s = await seguir(p.token);
    expect(s?.pedido.etapa).toBe("listo");
    expect((await estadoDe(p.id)).listo).toBe(true);

    // sigue visible en la plancha un rato (por si fue un error de dedo)
    const plancha = await rpc<Plancha>(db, A.userId, "listar_plancha");
    expect(plancha.pedidos.find((x) => x.id === p.id)?.estado).toBe("listo");
  });

  it("deshacer un plato devuelve el pedido a pendiente", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    expect((await estadoDe(p.id)).estado).toBe("listo");
    const r = await rpc<{ estado: string; items_listos: number }>(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0], p_listo: false });
    expect(r).toMatchObject({ estado: "pendiente", items_listos: 0 });
    expect(await estadoDe(p.id)).toMatchObject({ estado: "pendiente", listo: false });
  });

  it("marcar el pedido completo (mostrador) marca todos sus platos, y volver a pendiente los desmarca", async () => {
    const p = await pedidoAceptado([
      { producto_id: plato(menuA, "Perro caliente").id, cantidad: 1 },
      { producto_id: plato(menuA, "Gaseosa personal").id, cantidad: 1 },
    ]);
    await rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "listo" });
    let s = await seguir(p.token);
    expect(s?.items.every((i) => i.listo)).toBe(true);
    await rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "pendiente" });
    s = await seguir(p.token);
    expect(s?.items.some((i) => i.listo)).toBe(false);
    expect(s?.pedido.etapa).toBe("preparando");
  });

  it("la misma operación sin conexión (aplicar_operacion) también mueve los platos", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await rpc(db, A.userId, "aplicar_operacion", { p_clave: crypto.randomUUID(), p_tipo: "cambiar_estado", p_args: { p_pedido_id: p.id, p_estado: "entregado" } });
    const s = await seguir(p.token);
    expect(s?.pedido.etapa).toBe("entregado");
    expect(s?.items.every((i) => i.listo)).toBe(true);
  });

  it("agregar platos a un pedido listo: vuelve a pendiente y solo lo nuevo queda por preparar", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    await rpc(db, A.userId, "agregar_items_pedido", { p_pedido_id: p.id, p_items: [{ producto_id: plato(menuA, "Arepa con todo").id, cantidad: 1 }] });
    const s = await seguir(p.token);
    expect(s?.pedido.etapa).toBe("preparando");
    expect(s?.items.map((i) => [i.nombre, i.listo])).toEqual([["Perro caliente", true], ["Arepa con todo", false]]);
  });

  it("un pedido entregado ya no está en la plancha ni se puede marcar", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await rpc(db, A.userId, "cambiar_estado_pedido", { p_pedido_id: p.id, p_estado: "entregado" });
    const plancha = await rpc<Plancha>(db, A.userId, "listar_plancha");
    expect(plancha.pedidos.some((x) => x.id === p.id)).toBe(false);
    await expect(rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] })).rejects.toThrow(/ya se entregó/);
  });

  it("los listos con más de 15 minutos salen de la plancha", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    await db.query(`update public.pedidos set listo_at = now() - interval '16 minutes' where id = $1`, [p.id]);
    const plancha = await rpc<Plancha>(db, A.userId, "listar_plancha");
    expect(plancha.pedidos.some((x) => x.id === p.id)).toBe(false);
  });

  it("aislamiento: B no ve ni marca los platos de A", async () => {
    const p = await pedidoAceptado(unPerroCaliente(menuA));
    await expect(rpc(db, B.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] })).rejects.toThrow(/no existe/);
    const deB = await rpc<Plancha>(db, B.userId, "listar_plancha");
    expect(deB.pedidos.some((x) => x.id === p.id)).toBe(false);
    expect((await seguir(p.token))?.items[0].listo).toBe(false);
  });

  it("un plato anulado no cuenta para saber si el pedido está completo", async () => {
    const p = await pedidoAceptado([
      { producto_id: plato(menuA, "Perro caliente").id, cantidad: 1 },
      { producto_id: plato(menuA, "Arepa con todo").id, cantidad: 1 },
    ]);
    await rpc(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    expect((await estadoDe(p.id)).estado).toBe("pendiente"); // falta la arepa
    await rpc(db, A.userId, "anular_item_pedido", { p_item_id: p.itemIds[1], p_motivo: "Se acabó" });
    expect((await estadoDe(p.id)).estado).toBe("listo"); // ya no queda nada por preparar
    const r = await rpc<{ estado: string; items_total: number }>(db, A.userId, "marcar_item_listo", { p_item_id: p.itemIds[0] });
    expect(r).toMatchObject({ estado: "listo", items_total: 1 });
  });
});

describe("la demo", () => {
  it("los pedidos de ejemplo que van listos o entregados traen sus platos marcados; los pendientes no", async () => {
    const filas = await db.query<{ estado: string; marcados: number; total: number }>(
      `select p.estado, count(*) filter (where i.listo_at is not null)::int as marcados, count(*)::int as total
         from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
        where i.restaurante_id = $1 and not i.anulado and p.origen = 'mostrador'
        group by p.estado`,
      [A.restauranteId]
    );
    const por = Object.fromEntries(filas.rows.map((f) => [f.estado, f]));
    expect(por.entregado.marcados).toBe(por.entregado.total);
    expect(por.listo.marcados).toBe(por.listo.total);
    expect(por.pendiente.marcados).toBe(0);
  });

  it("reiniciar borra los pedidos de clientes y sus códigos de seguimiento", async () => {
    const C = await crearRestauranteDemo(db, "Reinicio De Clientes");
    const slug = await slugDe(C.restauranteId);
    const menu = await rpc<Menu>(db, C.userId, "obtener_menu_para_pedido");
    const r = await pedirComoCliente(slug, unPerroCaliente(menu));
    expect(await seguir(r.token)).not.toBeNull();
    await rpc(db, C.userId, "reiniciar_demo");
    expect(await seguir(r.token)).toBeNull();
    expect(await rpc<unknown[]>(db, C.userId, "listar_pedidos_por_confirmar")).toEqual([]);
  });
});

describe("autorización de tratamiento de datos (Ley 1581, migración 25)", () => {
  it("sin aceptar la política la base no recibe el pedido", async () => {
    for (const acepta of [null, false]) {
      await expect(pedirComoCliente(slugA, unPerroCaliente(menuA), { p_acepta_datos: acepta })).rejects.toThrow(/acepta el tratamiento de tus datos/);
    }
  });

  it("cada pedido en línea guarda cuándo se dio la autorización (la prueba que pide la ley)", async () => {
    const r = await pedirComoCliente(slugA, unPerroCaliente(menuA));
    const fila = await db.query<{ autorizado: Date | null }>(`select datos_autorizados_at as autorizado from public.pedidos where token_seguimiento = $1`, [r.token]);
    expect(fila.rows[0].autorizado).not.toBeNull();
    // Los del mostrador no pasan por aquí: no llevan la marca.
    const mostrador = await db.query<{ n: number }>(
      `select count(*)::int as n from public.pedidos where restaurante_id = $1 and origen <> 'cliente' and datos_autorizados_at is not null`,
      [A.restauranteId]
    );
    expect(mostrador.rows[0].n).toBe(0);
  });

  it("no quedó la versión vieja de la función (por ella se podría pedir sin aceptar)", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'publico_crear_pedido'`);
    expect(r.rows[0].n).toBe(1);
  });
});
