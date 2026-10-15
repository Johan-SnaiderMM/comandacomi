/**
 * Migración 21, sobre Postgres real (PGlite): el día que quedó sin cerrar (pasó la hora de corte sin cierre) se avisa y
 * se puede cerrar tarde, sin mover lo de hoy. La demo trae cerrados los 6 días anteriores, así que se "olvida" uno
 * anulando su cierre.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBase, crearRestauranteDemo, rpc } from "./base-datos";

let db: PGlite;
let A: { userId: string; restauranteId: string };
let hoy: string;

const fechaMenos = (dias: number) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const sinCerrar = (actor = A.userId) => rpc<string | null>(db, actor, "dia_sin_cerrar");
async function olvidar(fecha: string) {
  const c = await db.query<{ id: string }>(`select id from public.cierres_dia where restaurante_id = $1 and fecha = $2 and not anulado`, [A.restauranteId, fecha]);
  await rpc(db, A.userId, "anular_cierre", { p_cierre_id: c.rows[0].id, p_motivo: "Prueba: quedó sin cerrar" });
}
const cerrar = (fecha: string) => rpc(db, A.userId, "registrar_cierre", { p_fecha: fecha, p_base_caja: 100000, p_efectivo_contado: 300000 });

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Sin cerrar");
  hoy = (await como<{ d: string }>(db, A.userId, `select public.dia_de_trabajo()::text as d`))[0].d;
});
afterAll(() => db.close());

describe("el día que quedó sin cerrar", () => {
  it("con todos los días anteriores cerrados no hay nada que avisar (el de hoy no cuenta: todavía corre)", async () => {
    expect(await sinCerrar()).toBeNull();
    expect((await rpc<{ sin_cerrar: string | null }>(db, A.userId, "obtener_resumen_dia")).sin_cerrar).toBeNull();
  });

  it("si ayer quedó abierto, Inicio y Cierre lo dicen; mirando ese mismo día, no", async () => {
    await olvidar(fechaMenos(1));
    expect(await sinCerrar()).toBe(fechaMenos(1));
    expect((await rpc<{ sin_cerrar: string | null }>(db, A.userId, "obtener_resumen_dia")).sin_cerrar).toBe(fechaMenos(1));
    const deAyer = await rpc<{ sin_cerrar: string | null; cierre: unknown; resumen: { fecha: string; ventas: number } }>(db, A.userId, "obtener_resumen_dia", {
      p_fecha: fechaMenos(1),
    });
    expect(deAyer).toMatchObject({ sin_cerrar: null, cierre: null, resumen: { fecha: fechaMenos(1) } });
    expect(deAyer.resumen.ventas).toBeGreaterThan(0);
  });

  it("cerrarlo tarde lo guarda y no mueve nada de hoy", async () => {
    const deHoy = async () =>
      (await db.query<{ n: number }>(`select count(*)::int as n from public.pedidos where restaurante_id = $1 and fecha_cobro = $2`, [A.restauranteId, hoy])).rows[0].n;
    const antes = await deHoy();
    await cerrar(fechaMenos(1));
    expect(await sinCerrar()).toBeNull();
    expect(await deHoy()).toBe(antes);
    expect((await rpc<{ cierre: { fecha: string } | null }>(db, A.userId, "obtener_resumen_dia", { p_fecha: fechaMenos(1) })).cierre).toMatchObject({ fecha: fechaMenos(1) });
  });

  it("con dos días abiertos avisa primero el más reciente, y después el otro", async () => {
    await olvidar(fechaMenos(2));
    await olvidar(fechaMenos(4));
    expect(await sinCerrar()).toBe(fechaMenos(2));
    await cerrar(fechaMenos(2));
    expect(await sinCerrar()).toBe(fechaMenos(4));
    await cerrar(fechaMenos(4));
    expect(await sinCerrar()).toBeNull();
  });

  it("solo para quien ve las cuentas del día", async () => {
    const u = await db.query<{ id: string }>(`insert into auth.users (email) values ('mesero-sin-cerrar@ejemplo.test') returning id`);
    await db.query(`insert into public.perfiles (user_id, restaurante_id, rol, nombre) values ($1, $2, 'ayudante', 'Mesero')`, [u.rows[0].id, A.restauranteId]);
    await expect(sinCerrar(u.rows[0].id)).rejects.toThrow(/permiso para ver las cuentas del día/);
  });
});
