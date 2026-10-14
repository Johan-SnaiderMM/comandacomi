/**
 * Migración 20, sobre Postgres real (PGlite): el equipo entra con un código (un uso, 48 horas) desde su celular, el
 * dueño lo puede quitar, los avisos push siguen al rol y reiniciar la demo deja el equipo como nuevo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Equipo = {
  roles: { id: string; nombre: string }[];
  personas: { user_id: string; nombre: string; rol: string; roles: string[] }[];
  invitaciones: { id: string; nombre: string; codigo: string; expira_at: string; roles: string[] }[];
};
type Invitacion = { id: string; codigo: string; nombre: string; expira_at: string };
type Contexto = { restaurante: { nombre: string } | null; perfil: { nombre: string; rol: string; areas: string[]; roles: string[] } | null };

let db: PGlite;
let A: { userId: string; restauranteId: string };
let B: { userId: string; restauranteId: string };
let rolesA: Record<string, string>;
let rolesB: Record<string, string>;

const p256dh = "B".repeat(87);
const auth = "a".repeat(22);
const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

/** Un celular nuevo con su sesión anónima (aún sin restaurante): así queda tras "signInAnonymously". */
async function celularNuevo(): Promise<string> {
  return (await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`)).rows[0].id;
}
const equipo = (actor = A.userId) => rpc<Equipo>(db, actor, "listar_equipo");
const invitar = (nombre: string, roles: string[], actor = A.userId) => rpc<Invitacion>(db, actor, "crear_invitacion", { p_nombre: nombre, p_roles: roles });
const canjear = (actor: string | null, codigo: string) => rpc<{ restaurante: string; nombre: string; areas: string[] }>(db, actor, "canjear_invitacion", { p_codigo: codigo });
const contexto = (actor: string) => rpc<Contexto>(db, actor, "obtener_contexto");
const suscribir = (actor: string, ep: string, canales: string[]) =>
  rpc<{ canales: string[] }>(db, actor, "guardar_suscripcion_push", { p_endpoint: ep, p_p256dh: p256dh, p_auth: auth, p_canales: canales, p_agente: null });
const destinos = async (canal: string, actor = A.userId) =>
  (await rpc<{ endpoint: string }[]>(db, actor, "listar_destinos_push", { p_canal: canal })).map((d) => d.endpoint).sort();

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Invita A");
  B = await crearRestauranteDemo(db, "Invita B");
  rolesA = Object.fromEntries((await equipo()).roles.map((r) => [r.nombre, r.id]));
  rolesB = Object.fromEntries((await equipo(B.userId)).roles.map((r) => [r.nombre, r.id]));
});
afterAll(() => db.close());

describe("invitar con un código", () => {
  it("el dueño invita: un código de 8 letras y números que sirve 48 horas y queda esperando en el equipo", async () => {
    const inv = await invitar("  Carlos   Pérez ", [rolesA.Mesero, rolesA.Caja]);
    expect(inv.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(inv.nombre).toBe("Carlos Pérez");
    const horas = (new Date(inv.expira_at).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(47.9);
    expect(horas).toBeLessThanOrEqual(48);
    const pendiente = (await equipo()).invitaciones.find((i) => i.id === inv.id);
    expect(pendiente).toMatchObject({ nombre: "Carlos Pérez", codigo: inv.codigo, roles: [rolesA.Mesero, rolesA.Caja] });
    await rpc(db, A.userId, "anular_invitacion", { p_id: inv.id });
  });

  it("los códigos no se repiten y no traen letras que se confundan (0/O, 1/I)", async () => {
    const r = await db.query<{ c: string }>(`select public.fn_codigo_invitacion() as c from generate_series(1, 300)`);
    const codigos = r.rows.map((x) => x.c);
    expect(new Set(codigos).size).toBe(300);
    expect(codigos.every((c) => /^[A-HJ-NP-Z2-9]{8}$/.test(c))).toBe(true);
  });

  it("valida: nombre, al menos un rol, roles del propio local, y solo el dueño", async () => {
    await expect(invitar("   ", [rolesA.Mesero])).rejects.toThrow(/nombre de la persona/);
    await expect(invitar("Ana", [])).rejects.toThrow(/al menos un rol/);
    await expect(invitar("Ana", [rolesB.Mesero])).rejects.toThrow(/El rol no existe/);
    await expect(invitar("Ana", ["no-es-un-id"])).rejects.toThrow(/El rol no existe/);
    const mesero = await celularNuevo();
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Ayudante')`, [mesero, A.restauranteId]);
    await expect(invitar("Ana", [rolesA.Mesero], mesero)).rejects.toThrow(/Solo el dueño/);
    await expect(rpc(db, mesero, "listar_equipo")).rejects.toThrow(/Solo el dueño/);
  });

  it("en el celular de la persona: el código (como lo escriba) la vuelve del equipo, con sus roles", async () => {
    const inv = await invitar("Luz", [rolesA.Mesero, rolesA.Caja]);
    const celular = await celularNuevo();
    expect((await contexto(celular)).perfil).toBeNull();

    const escrito = `${inv.codigo.slice(0, 4).toLowerCase()}-${inv.codigo.slice(4)} `;
    await expect(canjear(celular, escrito)).resolves.toEqual({ restaurante: "Invita A", nombre: "Luz", areas: ["pedidos", "caja", "fiado"] });
    expect(await contexto(celular)).toMatchObject({ restaurante: { nombre: "Invita A" }, perfil: { nombre: "Luz", rol: "ayudante", roles: ["Mesero", "Caja"] } });

    const e = await equipo();
    expect(e.personas.find((p) => p.user_id === celular)).toMatchObject({ nombre: "Luz", roles: [rolesA.Mesero, rolesA.Caja] });
    expect(e.invitaciones.some((i) => i.id === inv.id)).toBe(false);
  });

  it("un código sirve una sola vez", async () => {
    const inv = await invitar("Rosa", [rolesA.Cocina]);
    await canjear(await celularNuevo(), inv.codigo);
    await expect(canjear(await celularNuevo(), inv.codigo)).rejects.toThrow(/Ese código no sirve/);
  });

  it("un código vencido o anulado no sirve; uno inventado tampoco", async () => {
    const vencido = await invitar("Vencido", [rolesA.Mesero]);
    await db.query(`update public.invitaciones_equipo set expira_at = now() - interval '1 minute' where id = $1`, [vencido.id]);
    await expect(canjear(await celularNuevo(), vencido.codigo)).rejects.toThrow(/Ese código no sirve/);

    const anulado = await invitar("Anulado", [rolesA.Mesero]);
    await rpc(db, A.userId, "anular_invitacion", { p_id: anulado.id });
    await expect(canjear(await celularNuevo(), anulado.codigo)).rejects.toThrow(/Ese código no sirve/);
    await expect(rpc(db, A.userId, "anular_invitacion", { p_id: anulado.id })).rejects.toThrow(/no existe o ya se usó/);

    await expect(canjear(await celularNuevo(), "ZZZZ-ZZZZ")).rejects.toThrow(/Ese código no sirve/);
  });

  it("un celular que ya es de un equipo no canjea otro código; sin sesión, ni siquiera se puede intentar", async () => {
    const inv = await invitar("Otra", [rolesA.Mesero]);
    await expect(canjear(A.userId, inv.codigo)).rejects.toThrow(/ya está en el equipo de Invita A/);
    await expect(canjear(B.userId, inv.codigo)).rejects.toThrow(/ya está en el equipo de Invita B/);
    await expect(canjear(null, inv.codigo)).rejects.toThrow(/permission denied/);
    // El intento fallido no gastó el código.
    expect((await equipo()).invitaciones.some((i) => i.id === inv.id)).toBe(true);
  });

  it("si el dueño quita uno de los roles antes de que se canjee, la persona entra sin ese", async () => {
    const { id: domiciliario } = await rpc<{ id: string }>(db, A.userId, "guardar_rol_equipo", { p_id: null, p_nombre: "Domiciliario", p_areas: ["pedidos"], p_activo: true });
    const inv = await invitar("Pepe", [domiciliario, rolesA.Cocina]);
    await rpc(db, A.userId, "guardar_rol_equipo", { p_id: domiciliario, p_nombre: "Domiciliario", p_areas: ["pedidos"], p_activo: false });
    await expect(canjear(await celularNuevo(), inv.codigo)).resolves.toMatchObject({ areas: ["plancha"] });
  });
});

describe("quitar del equipo", () => {
  it("el celular pierde el acceso al instante, y sus avisos se borran", async () => {
    const inv = await invitar("Temporal", [rolesA.Mesero]);
    const celular = await celularNuevo();
    await canjear(celular, inv.codigo);
    await suscribir(celular, endpoint("temporal"), ["pedidos"]);
    expect(await destinos("pedidos")).toContain(endpoint("temporal"));

    await expect(rpc(db, A.userId, "quitar_del_equipo", { p_user_id: celular })).resolves.toMatchObject({ nombre: "Temporal" });
    expect((await contexto(celular)).perfil).toBeNull();
    await expect(rpc(db, celular, "listar_pedidos_pendientes")).resolves.toEqual([]); // ya no ve nada del restaurante
    await expect(rpc(db, celular, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [] })).rejects.toThrow(/no tiene un restaurante/);
    expect(await destinos("pedidos")).not.toContain(endpoint("temporal"));
    expect((await equipo()).personas.some((p) => p.user_id === celular)).toBe(false);
  });

  it("al dueño no se le quita, solo el dueño quita, y solo a gente de su local", async () => {
    await expect(rpc(db, A.userId, "quitar_del_equipo", { p_user_id: A.userId })).rejects.toThrow(/Al dueño no se le puede quitar/);
    await expect(rpc(db, A.userId, "quitar_del_equipo", { p_user_id: B.userId })).rejects.toThrow(/no es de tu equipo/);
    const inv = await invitar("Fijo", [rolesA.Mesero]);
    const celular = await celularNuevo();
    await canjear(celular, inv.codigo);
    await expect(rpc(db, celular, "quitar_del_equipo", { p_user_id: celular })).rejects.toThrow(/Solo el dueño/);
  });
});

describe("los avisos siguen al rol", () => {
  it("cada quien solo se suscribe a los avisos de lo que su rol abre", async () => {
    const mesero = await celularNuevo();
    await canjear(mesero, (await invitar("Mesero avisos", [rolesA.Mesero])).codigo);
    // Pide pedidos y plancha: se guarda solo lo suyo.
    await expect(suscribir(mesero, endpoint("mesero"), ["pedidos", "cocina", "listos"])).resolves.toEqual({ canales: ["listos", "pedidos"] });
    await expect(suscribir(mesero, endpoint("mesero"), ["cocina"])).rejects.toThrow(/Tu rol no recibe esos avisos/);

    const cocina = await celularNuevo();
    await canjear(cocina, (await invitar("Cocina avisos", [rolesA.Cocina])).codigo);
    await expect(suscribir(cocina, endpoint("cocina"), ["cocina", "pedidos"])).resolves.toEqual({ canales: ["cocina"] });

    expect(await destinos("listos")).toContain(endpoint("mesero"));
    expect(await destinos("cocina")).toContain(endpoint("cocina"));
    expect(await destinos("cocina")).not.toContain(endpoint("mesero"));
  });

  it("al que le quitan el rol le dejan de llegar, aunque su celular siga suscrito", async () => {
    const mesero = await celularNuevo();
    await canjear(mesero, (await invitar("Mesero que cambia", [rolesA.Mesero])).codigo);
    await suscribir(mesero, endpoint("cambia"), ["pedidos", "listos"]);
    expect(await destinos("pedidos")).toContain(endpoint("cambia"));

    await rpc(db, A.userId, "asignar_roles", { p_user_id: mesero, p_roles: [rolesA.Cocina] });
    expect(await destinos("pedidos")).not.toContain(endpoint("cambia"));
    expect(await destinos("listos")).not.toContain(endpoint("cambia"));
  });
});

describe("reiniciar la demo deja el equipo como nuevo", () => {
  it("salen las personas y los códigos, los roles vuelven a ser los de siempre, y el dueño se queda", async () => {
    const pendiente = await invitar("Sin canjear", [rolesA.Mesero]);
    await rpc(db, A.userId, "guardar_rol_equipo", { p_id: null, p_nombre: "Cajero de noche", p_areas: ["caja"], p_activo: true });
    await rpc(db, A.userId, "asignar_roles", { p_user_id: A.userId, p_roles: [rolesA.Cocina] });
    const antes = await equipo();
    expect(antes.personas.length).toBeGreaterThan(3);

    await rpc(db, A.userId, "reiniciar_demo");
    const despues = await equipo();
    expect(despues.personas.map((p) => [p.user_id, p.rol, p.roles])).toEqual([[A.userId, "dueno", []]]);
    expect(despues.invitaciones).toEqual([]);
    expect(despues.roles.map((r) => r.nombre)).toEqual(["Mesero", "Cocina", "Caja"]);
    await expect(canjear(await celularNuevo(), pendiente.codigo)).rejects.toThrow(/Ese código no sirve/);

    // Quienes estaban ya no ven nada; B no se tocó.
    const exMiembro = antes.personas.find((p) => p.rol !== "dueno")!.user_id;
    expect((await contexto(exMiembro)).perfil).toBeNull();
    expect((await equipo(B.userId)).roles.map((r) => r.id).sort()).toEqual(Object.values(rolesB).sort());
  });

  it("nadie lee la tabla de invitaciones directamente (el código es una llave)", async () => {
    await invitar("Secreto", [(await equipo()).roles[0].id]);
    await expect(como(db, A.userId, `select codigo from public.invitaciones_equipo`)).rejects.toThrow(/permission denied/);
  });
});
