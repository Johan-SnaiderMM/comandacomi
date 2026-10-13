import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

let db: PGlite;
let dueno: string;
let rest: string;

beforeAll(async () => {
  db = await crearBase();
  ({ userId: dueno, restauranteId: rest } = await crearRestauranteDemo(db, "Demo Uno"));
});
afterAll(() => db.close());

describe("migraciones y datos de ejemplo", () => {
  it("las migraciones se aplican de cero sin errores", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    expect(r.rows[0].n).toBe(15);
  });

  it("el seed trae ~25 platos, 6 mesas, 8 clientes y 7 días de ventas y gastos", async () => {
    const c = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${t} where restaurante_id = $1`, [rest])).rows[0].n;
    expect(await c("productos")).toBe(25);
    expect(await c("mesas")).toBe(6);
    expect(await c("clientes")).toBe(8);
    expect(await c("categorias_producto")).toBe(7);
    const dias = await db.query<{ n: number }>(
      `select count(distinct fecha_cobro)::int as n from public.pedidos where restaurante_id = $1 and cobrado_at is not null and not anulado`,
      [rest]
    );
    expect(dias.rows[0].n).toBeGreaterThanOrEqual(6);
    const gastos = await db.query<{ n: number }>(`select count(distinct fecha)::int as n from public.gastos where restaurante_id = $1`, [rest]);
    expect(gastos.rows[0].n).toBe(7);
  });

  it("los 8 clientes tienen movimientos de fiado y el total por cobrar es positivo", async () => {
    const r = await rpc<{ id: string; saldo: number }[]>(db, dueno, "listar_clientes");
    expect(r).toHaveLength(8);
    const inicio = await rpc<Record<string, number>>(db, dueno, "obtener_inicio");
    expect(inicio.por_cobrar).toBeGreaterThan(100000);
    expect(inicio.clientes_con_deuda).toBeGreaterThanOrEqual(5);
  });

  it("reiniciar la demo es idempotente: deja los mismos conteos y borra lo creado", async () => {
    const antes = await db.query<{ n: number }>(`select count(*)::int as n from public.pedidos where restaurante_id = $1`, [rest]);
    await rpc(db, dueno, "reiniciar_demo");
    await rpc(db, dueno, "reiniciar_demo");
    const despues = await db.query<{ n: number }>(`select count(*)::int as n from public.pedidos where restaurante_id = $1`, [rest]);
    expect(despues.rows[0].n).toBe(antes.rows[0].n);
  });
});
