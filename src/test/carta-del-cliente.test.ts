/**
 * Migración 17, sobre Postgres real (PGlite): descripción y foto de los platos, y el horario de atención que abre y
 * cierra solo los pedidos en línea. La cuenta del horario existe dos veces (SQL y TypeScript): aquí se comparan.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { abiertoPorHorario, momentoBogota, type Franja, type Horario } from "@/lib/horario";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Producto = { id: string; categoria_id: string; nombre: string; precio: number; descripcion: string | null; foto: string | null };
type MenuPublico = { restaurante: { abierto: boolean; recibe: boolean; horario: Horario | null }; productos: Producto[] };
type MenuAdmin = { categorias: { id: string; nombre: string; productos: { id: string; nombre: string; precio: number; descripcion: string | null; foto_path: string | null }[] }[] };

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };
let slugA: string;
let ayudante: string;

const uuid = () => crypto.randomUUID();
const menuPublico = (slug = slugA) => rpc<MenuPublico>(db, null, "publico_menu", { p_slug: slug });
const menuAdmin = (actor = A.userId) => rpc<MenuAdmin>(db, actor, "listar_menu_admin");
const platoAdmin = async (nombre: string) => {
  const m = await menuAdmin();
  const categoria = m.categorias.find((c) => c.productos.some((p) => p.nombre === nombre))!;
  return { categoria, plato: categoria.productos.find((p) => p.nombre === nombre)! };
};
const guardar = (args: Record<string, unknown>, actor = A.userId) => rpc<{ id: string }>(db, actor, "guardar_producto", args);

/** Guarda el plato tal como está, cambiando solo lo que venga en `extra`. */
async function guardarPlato(nombre: string, extra: Record<string, unknown>) {
  const { categoria, plato } = await platoAdmin(nombre);
  return guardar({ p_id: plato.id, p_categoria_id: categoria.id, p_nombre: plato.nombre, p_precio: plato.precio, ...extra });
}

const hhmm = (minutos: number) => {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Un horario que con seguridad está ABIERTO ahora: una franja de cuatro horas alrededor de este momento. */
function horarioAbiertoAhora(): Horario {
  const { dia, minutos } = momentoBogota(new Date());
  const abre = minutos - 120;
  const cierra = minutos + 120;
  const h: Horario = [null, null, null, null, null, null, null];
  const franja: Franja = { abre: hhmm(abre), cierra: hhmm(cierra) };
  // Si la franja empezó ayer (cruza la medianoche hacia atrás), pertenece al día de ayer.
  h[abre < 0 ? (dia + 6) % 7 : dia] = franja;
  return h;
}

/** Un horario que con seguridad está CERRADO ahora: solo atiende dentro de tres días, a media mañana. */
function horarioCerradoAhora(): Horario {
  const { dia } = momentoBogota(new Date());
  const h: Horario = [null, null, null, null, null, null, null];
  h[(dia + 3) % 7] = { abre: "10:00", cierra: "11:00" };
  return h;
}

const unPedido = async (slug = slugA) => {
  const m = await menuPublico(slug);
  return rpc<{ token: string }>(db, null, "publico_crear_pedido", {
    p_slug: slug, p_tipo: "llevar", p_nombre: "Marta Pérez", p_telefono: `310${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`,
    p_direccion: null, p_notas: null, p_items: [{ producto_id: m.productos[0].id, cantidad: 1 }], p_acepta_datos: true,
  });
};

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Carta A");
  B = await crearRestauranteDemo(db, "Carta B");
  slugA = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [A.restauranteId])).rows[0].slug;
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('ayudante-carta@ejemplo.test') returning id`);
  ayudante = u.rows[0].id;
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante')`, [ayudante, A.restauranteId]);
});
afterAll(() => db.close());

describe("descripción del plato", () => {
  it("la demo trae descripciones y el cliente las ve en el menú", async () => {
    const m = await menuPublico();
    expect(m.productos.find((p) => p.nombre === "Hamburguesa sencilla")?.descripcion).toMatch(/Carne de res/);
    expect(m.productos.filter((p) => p.descripcion).length).toBeGreaterThanOrEqual(20);
    expect(m.productos.every((p) => p.foto === null)).toBe(true); // las fotos las pone cada restaurante
  });

  it("se guarda recortada y limpia; sin enviarla no cambia; vacía se quita", async () => {
    await guardarPlato("Perro caliente", { p_descripcion: "  Salchicha   premium,\n queso y papas.  " });
    expect((await platoAdmin("Perro caliente")).plato.descripcion).toBe("Salchicha premium, queso y papas.");

    await guardarPlato("Perro caliente", { p_precio: 9500 }); // cambiar el precio no la toca
    expect((await platoAdmin("Perro caliente")).plato).toMatchObject({ precio: 9500, descripcion: "Salchicha premium, queso y papas." });

    await guardarPlato("Perro caliente", { p_descripcion: "x".repeat(300) });
    expect((await platoAdmin("Perro caliente")).plato.descripcion).toHaveLength(160);

    await guardarPlato("Perro caliente", { p_descripcion: "" });
    expect((await platoAdmin("Perro caliente")).plato.descripcion).toBeNull();
    expect((await menuPublico()).productos.find((p) => p.nombre === "Perro caliente")?.descripcion).toBeNull();
  });

  it("un plato nuevo puede nacer con descripción", async () => {
    const { categoria } = await platoAdmin("Perro caliente");
    const nuevo = await guardar({ p_id: null, p_categoria_id: categoria.id, p_nombre: "Perro vegetariano", p_precio: 10000, p_descripcion: "Salchicha de lentejas." });
    expect((await menuPublico()).productos.find((p) => p.id === nuevo.id)).toMatchObject({ descripcion: "Salchicha de lentejas.", foto: null });
  });
});

describe("foto del plato", () => {
  it("se guarda la ruta, el cliente la recibe, y se puede quitar", async () => {
    const ruta = `${A.restauranteId}/${uuid()}.jpg`;
    await guardarPlato("Churrasco", { p_foto_path: ruta });
    expect((await platoAdmin("Churrasco")).plato.foto_path).toBe(ruta);
    expect((await menuPublico()).productos.find((p) => p.nombre === "Churrasco")?.foto).toBe(ruta);

    await guardarPlato("Churrasco", { p_descripcion: "Con chimichurri." }); // sin enviar la foto, se conserva
    expect((await platoAdmin("Churrasco")).plato.foto_path).toBe(ruta);

    await guardarPlato("Churrasco", { p_foto_path: "" });
    expect((await platoAdmin("Churrasco")).plato.foto_path).toBeNull();
  });

  it("no acepta la foto de la carpeta de otro restaurante ni rutas raras", async () => {
    await expect(guardarPlato("Churrasco", { p_foto_path: `${B.restauranteId}/${uuid()}.jpg` })).rejects.toThrow(/foto no es válida/);
    await expect(guardarPlato("Churrasco", { p_foto_path: `${A.restauranteId}/../../secreto.jpg` })).rejects.toThrow(/foto no es válida/);
    await expect(guardarPlato("Churrasco", { p_foto_path: "https://malo.example/foto.jpg" })).rejects.toThrow(/foto no es válida/);
    await expect(guardarPlato("Churrasco", { p_foto_path: `${A.restauranteId}/${uuid()}.svg` })).rejects.toThrow(/foto no es válida/);
    expect((await platoAdmin("Churrasco")).plato.foto_path).toBeNull();
  });

  it("subir al bucket: solo el dueño y solo a la carpeta de su restaurante; nadie lista ni borra", async () => {
    const subir = (actor: string | null, nombre: string) => como(db, actor, `insert into storage.objects (bucket_id, name) values ('platos-fotos', $1)`, [nombre]);
    await subir(A.userId, `${A.restauranteId}/hamburguesa.jpg`);
    await expect(subir(A.userId, `${B.restauranteId}/intrusa.jpg`)).rejects.toThrow(/row-level security/);
    await expect(subir(A.userId, "suelta.jpg")).rejects.toThrow(/row-level security/);
    await expect(subir(ayudante, `${A.restauranteId}/del-ayudante.jpg`)).rejects.toThrow(/row-level security/);
    await expect(subir(null, `${A.restauranteId}/anonima.jpg`)).rejects.toThrow(/permission denied|row-level security/);

    // No hay política de lectura: las fotos se ven por su dirección pública, no listando el bucket.
    expect(await como(db, A.userId, `select name from storage.objects where bucket_id = 'platos-fotos'`)).toEqual([]);
    const antes = (await db.query<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'platos-fotos'`)).rows[0].n;
    await como(db, A.userId, `delete from storage.objects where bucket_id = 'platos-fotos'`);
    await como(db, A.userId, `update storage.objects set name = 'x/y.jpg' where bucket_id = 'platos-fotos'`);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'platos-fotos'`)).rows[0].n).toBe(antes);

    const bucket = await db.query<{ public: boolean; file_size_limit: number }>(`select public, file_size_limit::int as file_size_limit from storage.buckets where id = 'platos-fotos'`);
    expect(bucket.rows[0]).toEqual({ public: true, file_size_limit: 524288 });
    // El de los comprobantes de gastos sigue siendo privado.
    expect((await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'gastos-fotos'`)).rows[0].public).toBe(false);
  });

  it("solo el dueño edita el plato (y con él su foto y su descripción)", async () => {
    const { categoria, plato } = await platoAdmin("Churrasco");
    await expect(
      guardar({ p_id: plato.id, p_categoria_id: categoria.id, p_nombre: plato.nombre, p_precio: plato.precio, p_descripcion: "Hackeada" }, ayudante)
    ).rejects.toThrow(/Solo el dueño/);
  });

  it("reiniciar la demo conserva las fotos de los platos de ejemplo (por nombre) y devuelve las descripciones", async () => {
    const ruta = `${A.restauranteId}/${uuid()}.webp`;
    await guardarPlato("Alitas BBQ x6", { p_foto_path: ruta, p_descripcion: "Texto cambiado en la visita" });
    await rpc(db, A.userId, "reiniciar_demo");
    const { plato } = await platoAdmin("Alitas BBQ x6");
    expect(plato.foto_path).toBe(ruta);
    expect(plato.descripcion).toBe("Seis alitas en salsa BBQ con papas a la francesa.");
    // Los demás platos siguen sin foto, y el plato que se había creado en la visita ya no está.
    const m = await menuPublico();
    expect(m.productos.filter((p) => p.foto !== null).map((p) => p.nombre)).toEqual(["Alitas BBQ x6"]);
    expect(m.productos.some((p) => p.nombre === "Perro vegetariano")).toBe(false);
  });
});

describe("horario de atención", () => {
  const configurar = (h: unknown, actor = A.userId) => rpc<{ horario: Horario | null }>(db, actor, "configurar_horario", { p_horario: h });
  const enSql = async (h: Horario | null, instante: Date) =>
    (await db.query<{ v: boolean }>(`select public.fn_abierto_por_horario($1::jsonb, $2::timestamptz) as v`, [h === null ? null : JSON.stringify(h), instante.toISOString()])).rows[0].v;

  it("TypeScript y SQL dicen lo mismo, minuto a minuto, para horarios de día, de noche y partidos", async () => {
    const diurno: Horario = [null, ...Array.from({ length: 6 }, () => ({ abre: "11:00", cierra: "22:00" }))];
    const nocturno: Horario = [{ abre: "20:00", cierra: "03:30" }, null, null, null, { abre: "18:00", cierra: "02:00" }, { abre: "18:00", cierra: "02:00" }, { abre: "18:00", cierra: "04:00" }];
    const raro: Horario = [{ abre: "00:00", cierra: "23:59" }, { abre: "23:30", cierra: "00:15" }, null, { abre: "06:00", cierra: "06:01" }, null, { abre: "12:00", cierra: "00:00" }, null];
    // Una semana completa (del domingo 11 al sábado 17 de octubre de 2026), cada 37 minutos, más los bordes exactos.
    const instantes: Date[] = [];
    for (let t = Date.parse("2026-10-11T05:00:00Z"); t < Date.parse("2026-10-18T05:00:00Z"); t += 37 * 60_000) instantes.push(new Date(t));
    for (const borde of ["11:00", "10:59", "22:00", "21:59", "18:00", "02:00", "01:59", "03:30", "00:00", "23:59", "00:15", "06:01"]) {
      for (const dia of ["2026-10-11", "2026-10-12", "2026-10-15", "2026-10-16", "2026-10-17"]) instantes.push(new Date(`${dia}T${borde}:00-05:00`));
    }
    for (const h of [diurno, nocturno, raro, null]) {
      const sql = await db.query<{ v: boolean }>(
        `select public.fn_abierto_por_horario($1::jsonb, t::timestamptz) as v from unnest($2::text[]) with ordinality as x(t, n) order by n`,
        [h === null ? null : JSON.stringify(h), instantes.map((i) => i.toISOString())]
      );
      const distintos = instantes.filter((i, n) => abiertoPorHorario(h, i) !== sql.rows[n].v).map((i) => i.toISOString());
      expect(distintos, `horario ${JSON.stringify(h)}`).toEqual([]);
    }
  });

  it("sin horario manda solo el interruptor (como antes)", async () => {
    expect((await menuPublico()).restaurante).toMatchObject({ abierto: true, recibe: true, horario: null });
    expect(await enSql(null, new Date())).toBe(true);
    await expect(unPedido()).resolves.toMatchObject({ token: expect.any(String) });
  });

  it("fuera de horario: el menú dice cerrado, trae el horario y no se puede pedir", async () => {
    const cerrado = horarioCerradoAhora();
    expect((await configurar(cerrado)).horario).toEqual(cerrado);
    const m = await menuPublico();
    expect(m.restaurante).toMatchObject({ abierto: false, recibe: true, horario: cerrado });
    await expect(unPedido()).rejects.toThrow(/está cerrado/);
    // El personal lo ve en su contexto; los pedidos del mostrador no dependen del horario.
    const ctx = await rpc<{ restaurante: { horario: Horario | null } }>(db, A.userId, "obtener_contexto");
    expect(ctx.restaurante.horario).toEqual(cerrado);
    await expect(rpc(db, A.userId, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: m.productos[0].id }] })).resolves.toBeTruthy();
  });

  it("en horario se puede pedir; con el interruptor apagado no, aunque sea hora de atención", async () => {
    await configurar(horarioAbiertoAhora());
    expect((await menuPublico()).restaurante).toMatchObject({ abierto: true, recibe: true });
    await expect(unPedido()).resolves.toMatchObject({ token: expect.any(String) });

    await rpc(db, A.userId, "configurar_pedidos_en_linea", { p_activo: false });
    expect((await menuPublico()).restaurante).toMatchObject({ abierto: false, recibe: false });
    await expect(unPedido()).rejects.toThrow(/no está recibiendo pedidos/);
    await rpc(db, A.userId, "configurar_pedidos_en_linea", { p_activo: true });
  });

  it("quitar el horario vuelve a dejarlo siempre abierto", async () => {
    await configurar(horarioCerradoAhora());
    expect((await menuPublico()).restaurante.abierto).toBe(false);
    expect((await configurar(null)).horario).toBeNull();
    expect((await menuPublico()).restaurante).toMatchObject({ abierto: true, horario: null });
  });

  it("rechaza horarios mal formados y sin ningún día de atención", async () => {
    const bueno = horarioAbiertoAhora();
    await expect(configurar(bueno.slice(0, 6))).rejects.toThrow(/horario no es válido/);
    await expect(configurar([...bueno.slice(0, 6), { abre: "25:00", cierra: "26:00" }])).rejects.toThrow(/horario no es válido/);
    await expect(configurar([...bueno.slice(0, 6), { abre: "11:00", cierra: "11:00" }])).rejects.toThrow(/horario no es válido/);
    await expect(configurar({ lunes: "11-22" })).rejects.toThrow(/horario no es válido/);
    await expect(configurar([null, null, null, null, null, null, null])).rejects.toThrow(/al menos un día/);
    expect((await menuPublico()).restaurante.horario).toBeNull(); // nada de eso se guardó
  });

  it("solo el dueño lo cambia, y el de un restaurante no toca el de otro", async () => {
    // Reiniciar saca al equipo de la visita anterior (migración 20): el ayudante vuelve a entrar para la prueba.
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante') on conflict do nothing`, [ayudante, A.restauranteId]);
    await expect(configurar(horarioCerradoAhora(), ayudante)).rejects.toThrow(/Solo el dueño/);
    await expect(rpc(db, null, "configurar_horario", { p_horario: null })).rejects.toThrow(/permission denied/);
    await configurar(horarioCerradoAhora());
    const slugB = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [B.restauranteId])).rows[0].slug;
    expect((await menuPublico(slugB)).restaurante).toMatchObject({ abierto: true, horario: null });
    await configurar(null);
  });

  it("reiniciar la demo la deja sin horario: la visita siguiente siempre puede hacer un pedido de muestra", async () => {
    await configurar(horarioCerradoAhora());
    expect((await menuPublico()).restaurante.abierto).toBe(false);
    await rpc(db, A.userId, "reiniciar_demo");
    expect((await menuPublico()).restaurante).toMatchObject({ abierto: true, recibe: true, horario: null });
  });
});
