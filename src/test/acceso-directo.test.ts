/**
 * ¿Qué puede hacer alguien que le habla DIRECTO a Supabase, sin pasar por la app? La llave pública ("anon") se
 * considera conocida: con ella cualquiera puede leer tablas, llamar funciones y hasta abrir una sesión anónima (la
 * misma que usa /unirme). Esta prueba lo intenta TODO, sobre Postgres real (PGlite), sin listas fijas: recorre cada
 * tabla y cada función que exista, así que cubre también las que se agreguen después.
 *
 *  · Nadie escribe tablas directo, y sin sesión nadie las lee.
 *  · Lo secreto (códigos de invitación, avisos push, PIN, operaciones) no lo lee ni el personal del local.
 *  · Un visitante con sesión pero sin local no ve ni una fila.
 *  · Llamar cada función con datos vacíos o con ids de OTRO local no cambia nada ni deja ver datos ajenos.
 *
 * (aislamiento.test.ts prueba a mano los ataques más importantes entre dos locales; esta los barre todos.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc, type Actor } from "./base-datos";

type Rest = { userId: string; restauranteId: string };

let db: PGlite;
let A: Rest;
let B: Rest;
/** Alguien con sesión (anónima) que no es de ningún local: lo que cualquiera consigue con la llave pública. */
let visitante: string;
/** Ids de B para atacar con ellos. */
let idsDeB: string[] = [];
/** Datos privados de B que no aparecen en A (para el barrido como dueño de A). */
let secretosDeB: string[] = [];
/** Datos privados de cualquiera de los dos locales (para el barrido sin local). */
let secretos: string[] = [];

const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
/** Lo que nadie, ni el propio personal, debe poder leer directo. */
const TABLAS_SECRETAS = ["invitaciones_equipo", "operaciones_aplicadas", "pines_reinicio", "suscripciones_push"];

async function tablas(): Promise<{ tabla: string; conLocal: boolean }[]> {
  const r = await db.query<{ tabla: string; con_local: boolean }>(
    `select c.relname as tabla,
            exists (select 1 from information_schema.columns k
                     where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'restaurante_id') as con_local
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`
  );
  return r.rows.map((x) => ({ tabla: x.tabla, conLocal: x.con_local }));
}

/** Foto de todo lo guardado (como superusuario): si cambia, alguien escribió. Con `local`, solo lo de ese local. */
async function foto(local?: string): Promise<string> {
  const partes: string[] = [];
  for (const { tabla, conLocal } of await tablas()) {
    if (local && !conLocal && tabla !== "restaurantes") continue;
    const filtro = !local ? "" : tabla === "restaurantes" ? "where t.id = $1" : "where t.restaurante_id = $1";
    const r = await db.query<{ h: string }>(
      `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from public.${tabla} t ${filtro}`,
      local ? [local] : []
    );
    partes.push(`${tabla}:${r.rows[0].h}`);
  }
  const extra = await db.query<{ usuarios: number; fotos: number }>(
    `select (select count(*) from auth.users)::int as usuarios, (select count(*) from storage.objects)::int as fotos`
  );
  partes.push(JSON.stringify(extra.rows[0]));
  return partes.join("\n");
}

type Funcion = { nombre: string; tipos: string[]; variadica: boolean };

async function funcionesDe(rol: "anon" | "authenticated"): Promise<Funcion[]> {
  const r = await db.query<{ nombre: string; tipos: string; variadica: boolean }>(
    `select p.proname as nombre, oidvectortypes(p.proargtypes) as tipos, p.provariadic <> 0 as variadica
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege($1, p.oid, 'execute')
      order by 1, 2`,
    [rol]
  );
  return r.rows.map((f) => ({ nombre: f.nombre, tipos: f.tipos ? f.tipos.split(", ") : [], variadica: f.variadica }));
}

/** Llama a la función con un valor por cada argumento (null, o un id de B en los uuid). Devuelve lo que contestó. */
async function llamar(actor: Actor, f: Funcion, uuid: string | null): Promise<string> {
  const args = f.tipos.map((t, i) => {
    const valor = t === "uuid" && uuid ? `'${uuid}'::uuid` : `null::${t}`;
    return f.variadica && i === f.tipos.length - 1 ? `variadic ${valor}` : valor;
  });
  try {
    return JSON.stringify(await como(db, actor, `select public.${f.nombre}(${args.join(", ")}) as r`));
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Llama a cada función de `rol` como `actor`: con todo vacío y, si recibe ids, con cada id de B. Devuelve qué
 * llamadas dejaron ver alguno de los `prohibidos`.
 */
async function barrer(actor: Actor, rol: "anon" | "authenticated", prohibidos: string[]) {
  const fugas: string[] = [];
  const funciones = await funcionesDe(rol);
  for (const f of funciones) {
    const variantes = f.tipos.includes("uuid") ? [null, ...idsDeB] : [null];
    for (const id of variantes) {
      const respuesta = await llamar(actor, f, id);
      const visto = prohibidos.find((s) => respuesta.includes(s));
      if (visto) fugas.push(`${f.nombre}(${f.tipos.join(", ")}) con ${id ?? "nada"} dejó ver «${visto}»`);
    }
  }
  return { fugas, cuantas: funciones.length };
}

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Directo A");
  B = await crearRestauranteDemo(db, "Directo B");
  visitante = (await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`)).rows[0].id;

  // B con algo en cada tabla, también en las secretas: un cliente y un gasto propios, una invitación, avisos push
  // del dueño y de un cliente en línea, y una persona del equipo con su rol.
  const roles = (await rpc<{ roles: { id: string }[] }>(db, B.userId, "listar_equipo")).roles;
  await rpc(db, B.userId, "crear_cliente", { p_nombre: "Clienta Secreta de B", p_telefono: "3009998877" });
  await rpc(db, B.userId, "registrar_gasto", { p_monto: 12345, p_categoria: "otros", p_nota: "Nota secreta de B" });
  await rpc(db, B.userId, "crear_invitacion", { p_nombre: "Invitado de B", p_roles: [roles[0].id] });
  await rpc(db, B.userId, "guardar_suscripcion_push", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/secreto-dueno-b", p_p256dh: P256DH, p_auth: AUTH, p_canales: ["pedidos"], p_agente: null,
  });
  const slugB = (await db.query<{ slug: string }>(`select slug from public.restaurantes where id = $1`, [B.restauranteId])).rows[0].slug;
  const menuB = await rpc<{ productos: { id: string }[] }>(db, null, "publico_menu", { p_slug: slugB });
  const enLinea = await rpc<{ token: string }>(db, null, "publico_crear_pedido", {
    p_slug: slugB, p_tipo: "domicilio", p_nombre: "Comprador Secreto", p_telefono: "3117776655", p_direccion: "Calle Secreta 12-34",
    p_notas: null, p_items: [{ producto_id: menuB.productos[0].id, cantidad: 1 }],
  });
  await rpc(db, null, "publico_guardar_push_cliente", { p_token: enLinea.token, p_endpoint: "https://fcm.googleapis.com/fcm/send/secreto-cliente-b", p_p256dh: P256DH, p_auth: AUTH });
  const persona = (await db.query<{ id: string }>(`insert into auth.users (email) values ('equipo-b@ejemplo.test') returning id`)).rows[0].id;
  await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Persona de B')`, [persona, B.restauranteId]);
  await rpc(db, B.userId, "asignar_roles", { p_user_id: persona, p_roles: [roles[0].id] });

  const uno = async (sql: string) => (await db.query<{ id: string }>(sql, [B.restauranteId])).rows[0].id;
  idsDeB = [
    B.restauranteId,
    B.userId,
    persona,
    await uno(`select id from public.pedidos where restaurante_id = $1 limit 1`),
    await uno(`select id from public.pedido_items where restaurante_id = $1 limit 1`),
    await uno(`select id from public.clientes where restaurante_id = $1 limit 1`),
    await uno(`select id from public.productos where restaurante_id = $1 limit 1`),
    await uno(`select id from public.gastos where restaurante_id = $1 limit 1`),
    await uno(`select id from public.roles_equipo where restaurante_id = $1 limit 1`),
    await uno(`select id from public.invitaciones_equipo where restaurante_id = $1 limit 1`),
    // El código de seguimiento (enLinea.token) NO va aquí: es la llave del cliente, y quien lo tiene ve su pedido a
    // propósito (publico_ver_pedido). Es un uuid al azar que solo llega a su celular.
  ];

  const codigo = (await db.query<{ codigo: string }>(`select codigo from public.invitaciones_equipo where restaurante_id = $1`, [B.restauranteId])).rows[0].codigo;
  secretosDeB = ["Clienta Secreta de B", "3009998877", "Nota secreta de B", "Comprador Secreto", "3117776655", "Calle Secreta", "secreto-dueno-b", "secreto-cliente-b", codigo, P256DH];
  // Los de ejemplo (A y B traen los mismos): nombres y teléfonos de clientes de fiado.
  const deEjemplo = await db.query<{ v: string }>(
    `select nombre as v from public.clientes union select telefono from public.clientes where telefono is not null`
  );
  secretos = [...secretosDeB, ...deEjemplo.rows.map((r) => r.v).filter((v) => v.length >= 6)];
}, 120_000);
afterAll(() => db.close());

describe("tablas: directo, nada", () => {
  it("nadie escribe tablas directo (ni con sesión), y sin sesión nadie las lee", async () => {
    const r = await db.query<{ tabla: string; problema: string }>(
      `select c.relname as tabla, p.privilegio || ' para ' || p.rol as problema
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join (values ('anon', 'select'), ('anon', 'insert'), ('anon', 'update'), ('anon', 'delete'), ('anon', 'truncate'),
                           ('authenticated', 'insert'), ('authenticated', 'update'), ('authenticated', 'delete'),
                           ('authenticated', 'truncate')) as p(rol, privilegio)
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege(p.rol, c.oid, p.privilegio)`
    );
    expect(r.rows).toEqual([]);
    expect((await tablas()).length).toBeGreaterThanOrEqual(19); // de verdad recorrió todas
  });

  it("lo secreto no lo lee ni el personal del local", async () => {
    for (const tabla of TABLAS_SECRETAS) {
      await expect(como(db, B.userId, `select * from public.${tabla}`), tabla).rejects.toThrow(/permission denied/);
    }
  });

  it("un visitante con sesión pero sin local no ve ni una fila de ninguna tabla", async () => {
    for (const { tabla } of await tablas()) {
      if (TABLAS_SECRETAS.includes(tabla)) continue;
      expect(await como(db, visitante, `select 1 from public.${tabla}`), tabla).toHaveLength(0);
    }
  });

  it("el dueño de A, leyendo directo, no ve ni una fila de B en ninguna tabla", async () => {
    for (const { tabla, conLocal } of await tablas()) {
      if (TABLAS_SECRETAS.includes(tabla)) continue;
      const columna = conLocal ? "restaurante_id" : tabla === "restaurantes" ? "id" : null;
      expect(columna, `${tabla}: ¿de qué local es cada fila?`).not.toBeNull();
      const filas = await como<{ local: string }>(db, A.userId, `select ${columna} as local from public.${tabla}`);
      expect(filas.filter((f) => f.local !== A.restauranteId), tabla).toEqual([]);
    }
  });
});

describe("funciones: llamarlas todas con datos vacíos o con ids de otro local", () => {
  it("sin sesión: solo la API pública, y no cambia nada ni deja ver nada privado", async () => {
    const antes = await foto();
    const { fugas, cuantas } = await barrer(null, "anon", secretos);
    expect(cuantas).toBeGreaterThan(0);
    expect(fugas).toEqual([]);
    expect(await foto()).toBe(antes);
  }, 120_000);

  it("con sesión pero sin local: ninguna función cambia nada ni deja ver nada de nadie", async () => {
    const antes = await foto();
    const { fugas, cuantas } = await barrer(visitante, "authenticated", secretos);
    expect(cuantas).toBeGreaterThan(50);
    expect(fugas).toEqual([]);
    expect(await foto()).toBe(antes);
  }, 300_000);

  it("el dueño de A, con ids de B: ninguna función toca a B ni deja ver sus datos", async () => {
    const antes = await foto(B.restauranteId);
    const { fugas } = await barrer(A.userId, "authenticated", secretosDeB);
    expect(fugas).toEqual([]);
    expect(await foto(B.restauranteId)).toBe(antes);
  }, 300_000);

  // Al final: el dueño de B puede reiniciar su demo en el barrido y borrar lo que las demás buscan.
  it("control: el barrido sí detecta lo que se ve (el dueño de B ve a su propia clienta)", async () => {
    const { fugas } = await barrer(B.userId, "authenticated", ["Clienta Secreta de B"]);
    expect(fugas.some((f) => f.startsWith("listar_clientes("))).toBe(true);
  }, 300_000);
});
