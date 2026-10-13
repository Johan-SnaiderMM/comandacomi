/**
 * Migración 13 sobre Postgres real (PGlite): los enlaces anteriores de un restaurante siguen llevando a él, nadie más
 * puede quedarse con ellos, y los platos quitados del menú se pueden ver y volver a poner.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Rest = { userId: string; restauranteId: string };
type MenuPublico = { restaurante: { nombre: string; slug: string }; productos: { id: string }[] } | null;
type MenuAdmin = {
  categorias: { id: string; nombre: string; productos: { id: string; nombre: string; precio: number }[] }[];
  quitados: { id: string; categoria_id: string; categoria: string; nombre: string; precio: number }[];
};

let db: PGlite;
let A: Rest;
let B: Rest;

const menuPublico = (slug: string | null) => rpc<MenuPublico>(db, null, "publico_menu", { p_slug: slug });
const fila = async (id: string) => (await db.query<{ slug: string; slugs_anteriores: string[] }>(`select slug, slugs_anteriores from public.restaurantes where id = $1`, [id])).rows[0];
const renombrar = (r: Rest, nombre: string) => rpc(db, r.userId, "reiniciar_demo", { p_nombre: nombre });
const admin = (r: Rest) => rpc<MenuAdmin>(db, r.userId, "listar_menu_admin");

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Picnic Delicias");
  B = await crearRestauranteDemo(db, "Otro Local");
});
afterAll(() => db.close());

describe("enlaces anteriores", () => {
  it("al renombrar, el enlace viejo sigue llevando al restaurante y dice cuál es el vigente", async () => {
    await renombrar(A, "Fonda La Nueva");
    expect(await fila(A.restauranteId)).toEqual({ slug: "fonda-la-nueva", slugs_anteriores: ["picnic-delicias"] });
    expect((await menuPublico("picnic-delicias"))?.restaurante).toMatchObject({ nombre: "Fonda La Nueva", slug: "fonda-la-nueva" });
    expect((await menuPublico("  PICNIC-Delicias "))?.restaurante.slug).toBe("fonda-la-nueva");
    expect((await menuPublico("fonda-la-nueva"))?.restaurante.slug).toBe("fonda-la-nueva");
  });

  it("un enlace que nunca existió sigue sin existir", async () => {
    expect(await menuPublico("no-existe-este-local")).toBeNull();
    expect(await menuPublico("")).toBeNull();
    expect(await menuPublico(null)).toBeNull();
  });

  it("otro restaurante no puede quedarse con un enlace que fue de alguien más", async () => {
    await renombrar(B, "Picnic Delicias");
    expect((await fila(B.restauranteId)).slug).toBe("picnic-delicias-2");
    expect((await menuPublico("picnic-delicias"))?.restaurante.nombre).toBe("Fonda La Nueva");
  });

  it("volver al nombre de antes recupera su enlace, sin dejarlo repetido entre los anteriores", async () => {
    await renombrar(A, "Picnic Delicias");
    expect(await fila(A.restauranteId)).toEqual({ slug: "picnic-delicias", slugs_anteriores: ["fonda-la-nueva"] });
    expect((await menuPublico("fonda-la-nueva"))?.restaurante.slug).toBe("picnic-delicias");
    await renombrar(A, "Picnic Delicias"); // reiniciar con el mismo nombre no cambia nada
    expect(await fila(A.restauranteId)).toEqual({ slug: "picnic-delicias", slugs_anteriores: ["fonda-la-nueva"] });
  });

  it("la función interna que resuelve enlaces no se puede llamar desde fuera", async () => {
    await expect(rpc(db, null, "fn_restaurante_por_slug", { p_slug: "picnic-delicias" })).rejects.toThrow(/permission denied/);
    await expect(rpc(db, A.userId, "fn_restaurante_por_slug", { p_slug: "picnic-delicias" })).rejects.toThrow(/permission denied/);
  });
});

describe("platos quitados del menú", () => {
  it("un plato quitado sale del menú, aparece en «quitados» y se puede volver a poner", async () => {
    const antes = await admin(A);
    expect(antes.quitados).toEqual([]);
    const categoria = antes.categorias.find((c) => c.nombre === "Perros")!;
    const plato = categoria.productos.find((p) => p.nombre === "Perro especial")!;
    const guardar = (activo: boolean) =>
      rpc(db, A.userId, "guardar_producto", { p_id: plato.id, p_categoria_id: categoria.id, p_nombre: plato.nombre, p_precio: plato.precio, p_disponible: true, p_activo: activo });

    await guardar(false);
    const sin = await admin(A);
    expect(sin.categorias.find((c) => c.id === categoria.id)!.productos.map((p) => p.nombre)).not.toContain("Perro especial");
    expect(sin.quitados).toEqual([{ id: plato.id, categoria_id: categoria.id, categoria: "Perros", nombre: "Perro especial", precio: plato.precio }]);
    expect((await menuPublico("picnic-delicias"))?.productos.map((p) => p.id)).not.toContain(plato.id);
    expect((await admin(B)).quitados).toEqual([]); // cada restaurante ve solo los suyos

    await guardar(true);
    const con = await admin(A);
    expect(con.quitados).toEqual([]);
    expect(con.categorias.find((c) => c.id === categoria.id)!.productos.map((p) => p.nombre)).toContain("Perro especial");
  });
});
