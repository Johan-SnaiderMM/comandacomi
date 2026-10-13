/**
 * Avisos push (migración 11) sobre Postgres real (PGlite): quién puede guardar y leer suscripciones, que cada
 * restaurante solo vea las suyas y que el visitante sin cuenta no pueda sacar la lista de celulares del personal.
 * (El envío real lo hace el servidor con web-push; aquí solo la parte de la base.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Rest = { userId: string; restauranteId: string };
type Destino = { endpoint: string; p256dh: string; auth: string };
type Menu = { productos: { id: string; nombre: string }[] };

let db: PGlite;
let A: Rest;
let B: Rest;
let slugA: string;
let menuA: Menu;
let contador = 0;

const p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const auth = "tBHItJI5svbpez7KI4CCXg";
const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}-${++contador}`;
const publico = <T = unknown>(fn: string, args: Record<string, unknown> = {}) => rpc<T>(db, null, fn, args);

async function guardar(userId: string, ep: string, canales: string[]) {
  return rpc<{ canales: string[] }>(db, userId, "guardar_suscripcion_push", { p_endpoint: ep, p_p256dh: p256dh, p_auth: auth, p_canales: canales, p_agente: "Chrome Android" });
}

async function pedidoDeCliente(slug: string) {
  const producto = menuA.productos.find((p) => p.nombre === "Perro caliente")!;
  const r = await publico<{ token: string; numero: number }>("publico_crear_pedido", {
    p_slug: slug,
    p_tipo: "llevar",
    p_nombre: "Marta Pérez",
    p_telefono: `311${String(2_000_000 + ++contador)}`,
    p_direccion: null,
    p_notas: null,
    p_items: [{ producto_id: producto.id, cantidad: 1 }],
  });
  await db.query(`update public.pedidos set created_at = created_at - interval '1 minute' where token_seguimiento = $1`, [r.token]);
  return r;
}

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Picnic Delicias");
  B = await crearRestauranteDemo(db, "Otro Local");
  slugA = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [A.restauranteId])).rows[0].slug;
  menuA = await rpc<Menu>(db, A.userId, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("suscripciones del personal", () => {
  it("guarda, consulta y quita los avisos de un celular", async () => {
    const ep = endpoint("dueno");
    expect(await rpc(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).toEqual({ activa: false, canales: [] });
    await guardar(A.userId, ep, ["pedidos", "listos", "pedidos"]);
    expect(await rpc(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).toEqual({ activa: true, canales: ["listos", "pedidos"] });

    // guardar de nuevo cambia los canales (no duplica)
    await guardar(A.userId, ep, ["cocina"]);
    expect(await rpc(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).toEqual({ activa: true, canales: ["cocina"] });
    const filas = await db.query(`select 1 from public.suscripciones_push where endpoint = $1`, [ep]);
    expect(filas.rows).toHaveLength(1);

    await rpc(db, A.userId, "quitar_suscripcion_push", { p_endpoint: ep });
    expect(await rpc(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).toEqual({ activa: false, canales: [] });
  });

  it("valida canales y dirección del celular", async () => {
    await expect(guardar(A.userId, endpoint("x"), [])).rejects.toThrow(/qué avisos/);
    await expect(guardar(A.userId, endpoint("x"), ["otros"])).rejects.toThrow(/qué avisos/);
    await expect(guardar(A.userId, endpoint("x"), ["cliente"])).rejects.toThrow(/qué avisos/);
    await expect(guardar(A.userId, "http://inseguro.example/x", ["pedidos"])).rejects.toThrow(/no pudo activar/);
    await expect(rpc(db, A.userId, "listar_destinos_push", { p_canal: "cliente" })).rejects.toThrow(/Canal/);
  });

  it("cada canal solo trae los celulares que lo pidieron, de SU restaurante", async () => {
    const dueno = endpoint("a-dueno");
    const parrilla = endpoint("a-parrilla");
    const mesero = endpoint("a-mesero");
    const ajeno = endpoint("b-dueno");
    await guardar(A.userId, dueno, ["pedidos"]);
    await guardar(A.userId, parrilla, ["cocina"]);
    await guardar(A.userId, mesero, ["listos", "cocina"]);
    await guardar(B.userId, ajeno, ["pedidos", "cocina", "listos"]);

    const eps = async (u: string, canal: string) => (await rpc<Destino[]>(db, u, "listar_destinos_push", { p_canal: canal })).map((d) => d.endpoint);
    expect(await eps(A.userId, "pedidos")).toEqual([dueno]);
    expect((await eps(A.userId, "cocina")).sort()).toEqual([mesero, parrilla].sort());
    expect(await eps(A.userId, "listos")).toEqual([mesero]);
    expect(await eps(B.userId, "pedidos")).toEqual([ajeno]);
    // trae las llaves que el servidor necesita para cifrar el aviso
    const d = (await rpc<Destino[]>(db, A.userId, "listar_destinos_push", { p_canal: "pedidos" }))[0];
    expect(d).toMatchObject({ p256dh, auth });
  });

  it("un restaurante no puede quitar ni tomar los celulares de otro", async () => {
    const ep = endpoint("a-solo");
    await guardar(A.userId, ep, ["pedidos"]);
    await rpc(db, B.userId, "quitar_suscripcion_push", { p_endpoint: ep });
    expect((await rpc<{ activa: boolean }>(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).activa).toBe(true);
    await expect(guardar(B.userId, ep, ["pedidos"])).rejects.toThrow(/otro restaurante/);
    expect((await rpc<{ canales: string[] }>(db, A.userId, "estado_suscripcion_push", { p_endpoint: ep })).canales).toEqual(["pedidos"]);
    const descartadas = await rpc<{ descartadas: number }>(db, B.userId, "descartar_suscripciones_push", { p_endpoints: [ep] });
    expect(descartadas.descartadas).toBe(0);
    const propias = await rpc<{ descartadas: number }>(db, A.userId, "descartar_suscripciones_push", { p_endpoints: [ep] });
    expect(propias.descartadas).toBe(1);
  });

  it("la tabla no se puede leer ni escribir directamente, ni con sesión ni sin ella", async () => {
    await guardar(A.userId, endpoint("directa"), ["pedidos"]);
    await expect(como(db, A.userId, `select * from public.suscripciones_push`)).rejects.toThrow(/permission denied/);
    await expect(como(db, null, `select * from public.suscripciones_push`)).rejects.toThrow(/permission denied/);
    await expect(
      como(db, A.userId, `insert into public.suscripciones_push (restaurante_id, canales, endpoint, clave_p256dh, clave_auth) values ('${A.restauranteId}', '{pedidos}', 'https://x.example/1', '${p256dh}', '${auth}')`)
    ).rejects.toThrow(/permission denied/);
  });

  it("sin sesión no se ejecuta ninguna función del personal", async () => {
    for (const [fn, args] of [
      ["guardar_suscripcion_push", { p_endpoint: endpoint("anon"), p_p256dh: p256dh, p_auth: auth, p_canales: ["pedidos"], p_agente: null }],
      ["listar_destinos_push", { p_canal: "pedidos" }],
      ["listar_destinos_push_pedido", { p_pedido_id: crypto.randomUUID() }],
      ["estado_suscripcion_push", { p_endpoint: "https://x.example/1" }],
      ["quitar_suscripcion_push", { p_endpoint: "https://x.example/1" }],
      ["descartar_suscripciones_push", { p_endpoints: [] }],
    ] as const) {
      await expect(publico(fn, args as Record<string, unknown>), fn).rejects.toThrow(/permission denied/);
    }
  });
});

describe("aviso al personal de un pedido nuevo (visitante sin cuenta)", () => {
  it("entrega los destinos del canal 'pedidos' UNA sola vez por pedido", async () => {
    const dueno = endpoint("nuevo-dueno");
    await guardar(A.userId, dueno, ["pedidos"]);
    const pedido = await pedidoDeCliente(slugA);

    const primera = await publico<{ numero: number; tipo: string; destinos: Destino[] }>("publico_destinos_push", { p_token: pedido.token });
    expect(primera.numero).toBe(pedido.numero);
    expect(primera.destinos.map((d) => d.endpoint)).toContain(dueno);

    const segunda = await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: pedido.token });
    expect(segunda.destinos).toEqual([]);
  });

  it("un código inventado, nulo, ya aceptado o cancelado no entrega nada", async () => {
    expect((await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: crypto.randomUUID() })).destinos).toEqual([]);
    expect((await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: null })).destinos).toEqual([]);

    const aceptado = await pedidoDeCliente(slugA);
    const id = (await db.query<{ id: string }>(`select id from public.pedidos where token_seguimiento = $1`, [aceptado.token])).rows[0].id;
    await rpc(db, A.userId, "confirmar_pedido_cliente", { p_pedido_id: id, p_minutos: 10 });
    expect((await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: aceptado.token })).destinos).toEqual([]);

    const cancelado = await pedidoDeCliente(slugA);
    await publico("publico_cancelar_pedido", { p_token: cancelado.token });
    expect((await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: cancelado.token })).destinos).toEqual([]);
  });

  it("un pedido de otro restaurante no trae los celulares de éste", async () => {
    const soloDeA = endpoint("solo-a");
    await guardar(A.userId, soloDeA, ["pedidos"]);
    const menuB = await rpc<Menu>(db, B.userId, "obtener_menu_para_pedido");
    const slugB = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [B.restauranteId])).rows[0].slug;
    const r = await publico<{ token: string }>("publico_crear_pedido", {
      p_slug: slugB, p_tipo: "llevar", p_nombre: "Luis", p_telefono: "3125559999", p_direccion: null, p_notas: null,
      p_items: [{ producto_id: menuB.productos.find((p) => p.nombre === "Perro caliente")!.id, cantidad: 1 }],
    });
    const d = await publico<{ destinos: Destino[] }>("publico_destinos_push", { p_token: r.token });
    expect(d.destinos.map((x) => x.endpoint)).not.toContain(soloDeA);
  });
});

describe("avisos del cliente sobre su pedido", () => {
  it("el cliente se suscribe con su código y el personal ve ese destino para ese pedido", async () => {
    const pedido = await pedidoDeCliente(slugA);
    const id = (await db.query<{ id: string }>(`select id from public.pedidos where token_seguimiento = $1`, [pedido.token])).rows[0].id;
    const ep = endpoint("cliente");
    await publico("publico_guardar_push_cliente", { p_token: pedido.token, p_endpoint: ep, p_p256dh: p256dh, p_auth: auth });

    const r = await rpc<{ token: string; numero: number; restaurante: string; destinos: Destino[] }>(db, A.userId, "listar_destinos_push_pedido", { p_pedido_id: id });
    expect(r).toMatchObject({ token: pedido.token, numero: pedido.numero, restaurante: "Picnic Delicias" });
    expect(r.destinos.map((d) => d.endpoint)).toEqual([ep]);

    // no aparece en los canales del personal ni lo puede ver otro restaurante
    for (const canal of ["pedidos", "cocina", "listos"]) {
      expect((await rpc<Destino[]>(db, A.userId, "listar_destinos_push", { p_canal: canal })).map((d) => d.endpoint)).not.toContain(ep);
    }
    const visto = await rpc<{ token: string | null; destinos: Destino[] }>(db, B.userId, "listar_destinos_push_pedido", { p_pedido_id: id });
    expect(visto).toMatchObject({ token: null, destinos: [] });
  });

  it("no acepta códigos inventados, pedidos terminados ni demasiados celulares por pedido", async () => {
    await expect(publico("publico_guardar_push_cliente", { p_token: crypto.randomUUID(), p_endpoint: endpoint("x"), p_p256dh: p256dh, p_auth: auth })).rejects.toThrow(/No encontramos/);

    const terminado = await pedidoDeCliente(slugA);
    await publico("publico_cancelar_pedido", { p_token: terminado.token });
    await expect(publico("publico_guardar_push_cliente", { p_token: terminado.token, p_endpoint: endpoint("x"), p_p256dh: p256dh, p_auth: auth })).rejects.toThrow(/ya terminó/);

    const pedido = await pedidoDeCliente(slugA);
    for (let i = 0; i < 3; i++) {
      await publico("publico_guardar_push_cliente", { p_token: pedido.token, p_endpoint: endpoint("v"), p_p256dh: p256dh, p_auth: auth });
    }
    await expect(publico("publico_guardar_push_cliente", { p_token: pedido.token, p_endpoint: endpoint("v"), p_p256dh: p256dh, p_auth: auth })).rejects.toThrow(/varios celulares/);
  });

  it("un cliente no puede apropiarse del celular de alguien del personal", async () => {
    const personal = endpoint("personal");
    await guardar(A.userId, personal, ["pedidos"]);
    const pedido = await pedidoDeCliente(slugA);
    await expect(publico("publico_guardar_push_cliente", { p_token: pedido.token, p_endpoint: personal, p_p256dh: p256dh, p_auth: auth })).rejects.toThrow(/ya recibe avisos/);
    expect((await rpc<{ canales: string[] }>(db, A.userId, "estado_suscripcion_push", { p_endpoint: personal })).canales).toEqual(["pedidos"]);
  });

});

describe("limpieza: los celulares de visitas anteriores no se quedan para siempre (migración 12)", () => {
  const deRestaurante = async (restauranteId: string) =>
    (await db.query<{ endpoint: string }>(`select endpoint from public.suscripciones_push where restaurante_id = $1 order by endpoint`, [restauranteId])).rows.map((x) => x.endpoint);

  async function localConPedidoDeCliente(nombre: string) {
    const C = await crearRestauranteDemo(db, nombre);
    const slugC = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [C.restauranteId])).rows[0].slug;
    const menuC = await rpc<Menu>(db, C.userId, "obtener_menu_para_pedido");
    const r = await publico<{ token: string }>("publico_crear_pedido", {
      p_slug: slugC, p_tipo: "llevar", p_nombre: "Ana", p_telefono: "3135550000", p_direccion: null, p_notas: null,
      p_items: [{ producto_id: menuC.productos.find((p) => p.nombre === "Perro caliente")!.id, cantidad: 1 }],
    });
    const cliente = endpoint("cliente");
    await publico("publico_guardar_push_cliente", { p_token: r.token, p_endpoint: cliente, p_p256dh: p256dh, p_auth: auth });
    return C;
  }

  it("al reiniciar la demo se van los avisos de los clientes Y los de los celulares del personal", async () => {
    const C = await localConPedidoDeCliente("Local Para Reiniciar");
    await guardar(C.userId, endpoint("visita-anterior-1"), ["pedidos"]);
    await guardar(C.userId, endpoint("visita-anterior-2"), ["cocina", "listos"]);
    expect(await deRestaurante(C.restauranteId)).toHaveLength(3);

    await rpc(db, C.userId, "reiniciar_demo", { p_nombre: null });
    expect(await deRestaurante(C.restauranteId)).toEqual([]);
  });

  it("se conserva solo el celular desde el que se reinicia (quien enseña la demo)", async () => {
    const C = await localConPedidoDeCliente("Local Que Conserva");
    const mio = endpoint("el-que-reinicia");
    await guardar(C.userId, endpoint("otro"), ["pedidos"]);
    await guardar(C.userId, mio, ["pedidos", "listos"]);

    await rpc(db, C.userId, "reiniciar_demo", { p_nombre: "Fonda La Nueva", p_conservar_endpoint: mio });
    expect(await deRestaurante(C.restauranteId)).toEqual([mio]);
    expect(await rpc(db, C.userId, "estado_suscripcion_push", { p_endpoint: mio })).toEqual({ activa: true, canales: ["listos", "pedidos"] });
  });

  it("reiniciar un local no toca los celulares de otro, ni conserva uno ajeno", async () => {
    const C = await localConPedidoDeCliente("Local Vecino");
    const ajeno = endpoint("de-a");
    await guardar(A.userId, ajeno, ["pedidos"]);
    const antes = await deRestaurante(A.restauranteId);

    await rpc(db, C.userId, "reiniciar_demo", { p_nombre: null, p_conservar_endpoint: ajeno });
    expect(await deRestaurante(C.restauranteId)).toEqual([]);
    expect(await deRestaurante(A.restauranteId)).toEqual(antes);
  });

  it("con el tope lleno, un celular nuevo entra y sale el que lleva más tiempo sin activar sus avisos", async () => {
    const D = await crearRestauranteDemo(db, "Local Con Muchos Celulares");
    const eps: string[] = [];
    for (let i = 0; i < 30; i++) {
      const ep = endpoint(`cel-${String(i).padStart(2, "0")}`);
      eps.push(ep);
      await guardar(D.userId, ep, ["pedidos"]);
      // cada uno se activó un minuto después del anterior: el 0 es el más viejo
      await db.query(`update public.suscripciones_push set actualizada_at = now() - make_interval(mins => $2) where endpoint = $1`, [ep, 60 - i]);
    }
    expect(await deRestaurante(D.restauranteId)).toHaveLength(30);

    // Volver a guardar uno que ya estaba no saca a nadie (y lo deja como el más reciente).
    await guardar(D.userId, eps[0], ["pedidos", "cocina"]);
    expect(await deRestaurante(D.restauranteId)).toHaveLength(30);

    const nuevo = endpoint("cel-nuevo");
    await guardar(D.userId, nuevo, ["listos"]); // antes: "Ya hay demasiados celulares…"
    const quedan = await deRestaurante(D.restauranteId);
    expect(quedan).toHaveLength(30);
    expect(quedan).toContain(nuevo);
    expect(quedan).toContain(eps[0]); // se acababa de guardar: es de los recientes
    expect(quedan).not.toContain(eps[1]); // el más viejo de los que quedaban
  });

  it("el tope no cuenta ni saca los avisos de los clientes, ni los celulares de otro restaurante", async () => {
    const E = await localConPedidoDeCliente("Local Con Cliente Y Tope");
    for (let i = 0; i < 30; i++) await guardar(E.userId, endpoint("e"), ["pedidos"]);
    const deAAntes = await deRestaurante(A.restauranteId);
    await guardar(E.userId, endpoint("e-extra"), ["pedidos"]);

    const filas = await db.query<{ cliente: boolean; n: number }>(
      `select (pedido_id is not null) as cliente, count(*)::int as n from public.suscripciones_push where restaurante_id = $1 group by 1 order by 1`,
      [E.restauranteId]
    );
    expect(filas.rows).toEqual([{ cliente: false, n: 30 }, { cliente: true, n: 1 }]);
    expect(await deRestaurante(A.restauranteId)).toEqual(deAAntes);
  });
});
